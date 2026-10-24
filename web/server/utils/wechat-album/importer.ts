import { createHash, randomUUID } from 'node:crypto'
import { getTargetPool, type SqlConnection } from '../db/pool.ts'
import { queryTarget, withTargetTransaction } from '../db/query.ts'
import { getOssConfig, isOssConfigured } from '../oss/config.ts'
import { deleteOssObject } from '../oss/delete.ts'
import { buildObjectKey, createPostObjectPolicy } from '../oss/policy.ts'
import { crawlWechatAlbum } from './crawler.mjs'
import { normalizeWechatImageUrl, wechatImageIdentity } from './content.mjs'
import { canonicalArticleUrl } from './parser.mjs'
import { wechatShanghaiDateKey } from './schedule.mjs'
import {
  MOBILE_WECHAT_UA,
  extractMsgCdnUrl,
  resolveArticleCoverId,
} from './article-page.ts'

/*
 * 文章页必须用手机微信 UA：采集器 UA（DaxinWechatAlbumSync/1.0）抓 mp.weixin.qq.com/s
 * 会被微信拦成「环境异常」，取不到 msg_cdn_url。
 * 专辑接口（/mp/appmsgalbum）用同一个 UA 同样可以正常分页。
 */
const USER_AGENT = MOBILE_WECHAT_UA
const MAX_PAGE_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const PAGE_DELAY_MS = 1000

type AlbumSource = {
  id: number | string
  source_key: string
  name: string
  album_url: string
  category_slug: string
  cursor_message_id: string
  cursor_item_index: string
  initial_synced_at: Date | string | null
  deployment_full_synced_at: Date | string | null
}
type AlbumRun = { source_id: number | string; status: string; sync_mode: string }
type AlbumItem = {
  messageId: string
  itemIndex: string
  url: string
  title: string
  publishedAt: string
  coverUrl: string
}
type IdRow = { id: number | string }
type ArticleRow = { id: number | string; cover_media_id: number | string | null; legacy_source_table: string | null }
type ArticleCoverRow = {
  id: number | string
  cover_media_id: number | string | null
  width: number | string | null
  height: number | string | null
}
type MediaRow = { id: number | string; public_url: string; object_key: string }
type DbHeader = { insertId?: number | string }
type UploadedImage = { id: number; publicUrl: string; objectKey: string; mimeType: string; byteSize: number }
type ImportResult = { fetchedCount: number; insertedCount: number; duplicateCount: number; imageCount: number }

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function legacyId(value: string): string {
  return BigInt(`0x${sha256(value).slice(0, 15)}`).toString(10)
}

function articleIdentity(item: Pick<AlbumItem, 'url'>): { url: string; hash: string; slug: string; legacyId: string } {
  const url = canonicalArticleUrl(item.url)
  if (!url) throw new Error('公众号文章链接不是有效的公开原文地址')
  const hash = sha256(url)
  return { url, hash, slug: `wechat-${hash.slice(0, 40)}`, legacyId: legacyId(url) }
}

function assertWechatPageUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com') {
    throw new Error('公众号页面跳转离开微信公开文章站点，本次采集已停止')
  }
  return url
}

async function readLimitedBytes(response: Response, maxBytes: number, label: string): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error(`${label}超过大小限制`)
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error(`${label}超过大小限制`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`${label}超过大小限制`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function readLimitedText(response: Response, maxBytes: number, label: string): Promise<string> {
  return new TextDecoder('utf-8').decode(await readLimitedBytes(response, maxBytes, label))
}

async function fetchWechatText(urlValue: string, referer?: string): Promise<string> {
  const url = assertWechatPageUrl(urlValue)
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1',
      ...(referer ? { referer } : {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  if (response.url) assertWechatPageUrl(response.url)
  if (!response.ok) throw new Error(`读取公众号页面失败（HTTP ${response.status}）`)
  const text = await readLimitedText(response, MAX_PAGE_BYTES, '公众号页面')
  if (/环境异常|操作频繁|安全验证|请在微信客户端打开|访问过于频繁|频繁操作/i.test(text)) {
    throw new Error('公众号页面返回了访问限制或验证提示，已停止采集')
  }
  if (/captcha|verifycode|验证码/i.test(text) && !text.includes('js_content')) {
    throw new Error('公众号页面要求访问验证，已停止采集')
  }
  return text
}

/**
 * 读取文章页长图（msg_cdn_url，900x382）。
 *
 * 抓取失败、被拦、页面没有该变量都只告警并返回空串：调用方会退回专辑方图，
 * 不影响整条采集（延续「封面失败不中断」的既有原则）。
 */
async function readArticleLongCover(url: string): Promise<string> {
  try {
    const html = await fetchWechatText(url)
    const cover = extractMsgCdnUrl(html)
    if (!cover) {
      console.warn('[wechat-album-import] 文章页没有 msg_cdn_url，退回专辑方图', { url: url.slice(0, 120) })
    }
    return cover
  } catch (error) {
    console.warn('[wechat-album-import] 文章页长图获取失败，退回专辑方图', {
      url: url.slice(0, 120),
      message: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

function imageFormat(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { mimeType: 'image/jpeg', extension: 'jpg' }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { mimeType: 'image/png', extension: 'png' }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)))) return { mimeType: 'image/gif', extension: 'gif' }
  return null
}

async function uploadImage(sourceUrl: string, label: string): Promise<UploadedImage> {
  const normalizedUrl = normalizeWechatImageUrl(sourceUrl)
  const response = await fetch(normalizedUrl, {
    headers: { 'user-agent': USER_AGENT, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', referer: 'https://mp.weixin.qq.com/' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  if (response.url && !normalizeWechatImageUrl(response.url)) throw new Error('微信图片跳转到了不支持的图片域名，本次采集已停止')
  if (!response.ok) throw new Error(`读取文章图片失败（HTTP ${response.status}）`)
  const bytes = await readLimitedBytes(response, MAX_IMAGE_BYTES, '文章图片')
  const format = imageFormat(bytes)
  if (!format) throw new Error('文章图片格式不是受支持的 JPEG、PNG、WebP 或 GIF')
  if (!isOssConfigured()) throw new Error('OSS 未配置，无法保存公众号封面')

  const config = getOssConfig()
  const digest = sha256(wechatImageIdentity(normalizedUrl))
  const sourceId = legacyId(wechatImageIdentity(normalizedUrl))
  const existing = await queryTarget<MediaRow>(
    `SELECT id, object_key, public_url FROM media_assets
     WHERE legacy_source_table = 'wechat_album_image' AND legacy_source_id = ? AND deleted_at IS NULL LIMIT 1`,
    [sourceId],
  )
  if (existing[0]?.id && existing[0]?.public_url) {
    return { id: Number(existing[0].id), publicUrl: existing[0].public_url, objectKey: existing[0].object_key, mimeType: format.mimeType, byteSize: bytes.byteLength }
  }

  const objectKey = buildObjectKey({ date: new Date(), uuid: randomUUID(), extension: format.extension })
  const policy = createPostObjectPolicy({
    config,
    objectKey,
    mimeType: format.mimeType,
    usageScope: 'article',
    maxBytes: config.uploadMaxBytes,
  })
  if (bytes.byteLength > policy.maxBytes) throw new Error(`文章图片超过 OSS 上传上限（${policy.maxBytes} 字节）`)
  const form = new FormData()
  form.set('key', policy.key)
  form.set('policy', policy.policy)
  form.set('OSSAccessKeyId', policy.accessKeyId)
  form.set('signature', policy.signature)
  form.set('Content-Type', format.mimeType)
  form.set('success_action_status', '200')
  const blobBytes = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(blobBytes).set(bytes)
  form.set('file', new Blob([blobBytes], { type: format.mimeType }), `${digest}.${format.extension}`)
  const uploaded = await fetch(policy.host, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) })
  if (!uploaded.ok) throw new Error(`OSS 图片上传失败（HTTP ${uploaded.status}）`)
  const objectResponse = await fetch(policy.publicUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) })
  if (!objectResponse.ok) throw new Error(`OSS 图片上传后校验失败（HTTP ${objectResponse.status}）`)
  const objectType = (objectResponse.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  const objectSize = Number(objectResponse.headers.get('content-length') ?? bytes.byteLength)
  if (objectType !== format.mimeType || objectSize !== bytes.byteLength) throw new Error('OSS 图片校验的类型或大小与上传内容不一致')

  await queryTarget(
    `INSERT INTO media_assets
       (object_key, public_url, file_name, mime_type, byte_size, usage_scope, title,
        legacy_source_table, legacy_source_id, uploaded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'article', ?, 'wechat_album_image', ?, NULL, NOW(), NOW())
     ON DUPLICATE KEY UPDATE public_url = VALUES(public_url), file_name = VALUES(file_name),
       mime_type = VALUES(mime_type), byte_size = VALUES(byte_size), usage_scope = VALUES(usage_scope),
       title = VALUES(title), legacy_source_table = VALUES(legacy_source_table),
       legacy_source_id = VALUES(legacy_source_id), deleted_at = NULL, updated_at = NOW()`,
    [objectKey, policy.publicUrl, `${digest}.${format.extension}`, format.mimeType, bytes.byteLength, label.slice(0, 255), sourceId],
  )
  const rows = await queryTarget<IdRow>(`SELECT id FROM media_assets WHERE object_key = ? LIMIT 1`, [objectKey])
  const mediaId = Number(rows[0]?.id ?? 0)
  if (!mediaId) throw new Error('OSS 图片已上传，但写入媒体记录失败')
  return { id: mediaId, publicUrl: policy.publicUrl, objectKey, mimeType: format.mimeType, byteSize: bytes.byteLength }
}

async function findExistingArticle(url: string): Promise<ArticleRow | null> {
  const identity = articleIdentity({ url })
  const rows = await queryTarget<ArticleRow>('SELECT id, cover_media_id, legacy_source_table FROM articles WHERE slug = ? LIMIT 1', [identity.slug])
  return rows[0] ?? null
}

async function findArticleById(id: number): Promise<ArticleRow | null> {
  const rows = await queryTarget<ArticleRow>('SELECT id, cover_media_id, legacy_source_table FROM articles WHERE id = ? LIMIT 1', [id])
  return rows[0] ?? null
}

/** 旧站迁移文章没有公众号 URL；按栏目、标题和自然日匹配后复用原记录。 */
async function findLegacyArticle(item: AlbumItem, categoryId: number): Promise<ArticleRow | null> {
  const rows = await queryTarget<ArticleRow>(
    `SELECT id, cover_media_id, legacy_source_table FROM articles
     WHERE category_id = ? AND title = ? AND DATE(published_at) = DATE(?)
       AND status = 'published' ORDER BY id LIMIT 1`,
    [categoryId, item.title.trim().slice(0, 255), item.publishedAt],
  )
  return rows[0] ?? null
}

async function findExistingSourceItem(sourceId: number, item: AlbumItem): Promise<number | null> {
  const rows = await queryTarget<{ article_id: number | string | null }>(
    `SELECT article_id FROM wechat_album_items WHERE source_id = ? AND message_id = ? AND item_index = ? LIMIT 1`,
    [sourceId, item.messageId, item.itemIndex],
  )
  const id = Number(rows[0]?.article_id ?? 0)
  return id > 0 ? id : null
}

async function writeArticle(
  source: AlbumSource,
  item: AlbumItem,
  cover: UploadedImage | null,
  coverIsLong: boolean,
  categoryId: number,
  existingArticleId: number | null,
): Promise<{ articleId: number; inserted: boolean }> {
  const identity = articleIdentity(item)
  return withTargetTransaction(async (connection: SqlConnection) => {
    // 连表取出当前封面尺寸：长图封面不能被专辑方图覆盖回去（原 COALESCE 会覆盖）。
    const [existingRows] = await connection.execute(
      `SELECT a.id, a.cover_media_id, m.width, m.height
       FROM articles a LEFT JOIN media_assets m ON m.id = a.cover_media_id
       WHERE a.slug = ? LIMIT 1`,
      [identity.slug],
    )
    const existing = (existingRows as ArticleCoverRow[])[0]
    let articleId = existingArticleId || Number(existing?.id ?? 0)
    const inserted = articleId === 0
    const coverMediaId = resolveArticleCoverId({
      existingCoverId: Number(existing?.cover_media_id ?? 0) || null,
      existingCoverWidth: Number(existing?.width ?? 0) || null,
      existingCoverHeight: Number(existing?.height ?? 0) || null,
      nextCoverId: cover?.id ?? null,
      nextIsLong: coverIsLong,
    })
    if (inserted) {
      const title = item.title.trim().slice(0, 255)
      const publishedAt = item.publishedAt
      if (!title) throw new Error('文章缺少标题')
      if (!publishedAt) throw new Error(`文章“${title}”缺少可读取的发布时间`)
      const [header] = await connection.execute(
        `INSERT INTO articles
           (slug, title, summary, content_html, content_text, category_id, cover_media_id, published_at,
            status, is_featured, show_in_sidebar, legacy_source_table, legacy_source_id, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, 'published', 0, 0, 'wechat_album', ?, NOW(), NOW())`,
        [identity.slug, title, categoryId, coverMediaId, publishedAt, identity.legacyId],
      )
      articleId = Number((header as DbHeader).insertId ?? 0)
      if (!articleId) throw new Error(`写入公众号文章失败：${title}`)
    } else {
      await connection.execute(
        `UPDATE articles SET title = ?, summary = NULL, content_html = NULL, content_text = NULL,
           category_id = ?, cover_media_id = ?, published_at = ?,
           status = 'published', legacy_source_table = 'wechat_album', legacy_source_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [item.title.trim().slice(0, 255), categoryId, coverMediaId, item.publishedAt, identity.legacyId, articleId],
      )
      await removeArticleBodyImages(connection, articleId)
    }

    await connection.execute(
      `INSERT INTO wechat_album_items
         (source_id, message_id, item_index, article_hash, article_id, source_url, title, cover_source_url, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE article_hash = VALUES(article_hash), article_id = VALUES(article_id),
         source_url = VALUES(source_url), title = VALUES(title), cover_source_url = VALUES(cover_source_url),
         published_at = VALUES(published_at), updated_at = NOW()`,
      [source.id, item.messageId, item.itemIndex, identity.hash, articleId, identity.url.slice(0, 2048), item.title.slice(0, 255), item.coverUrl.slice(0, 2048), item.publishedAt || null],
    )
    return { articleId, inserted }
  })
}

type BodyMediaRow = { id: number | string; object_key: string }

/** 删除该文章正文配图；共享图和任何文章封面均保留。 */
async function removeArticleBodyImages(connection: SqlConnection, articleId: number): Promise<void> {
  const [mediaRows] = await connection.execute(
    `SELECT DISTINCT m.id, m.object_key
     FROM article_images ai
     JOIN media_assets m ON m.id = ai.media_id AND m.deleted_at IS NULL
     WHERE ai.article_id = ?
       AND NOT EXISTS (SELECT 1 FROM articles cover_ref WHERE cover_ref.cover_media_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM article_images other_ref WHERE other_ref.media_id = m.id AND other_ref.article_id <> ?)
     FOR UPDATE`,
    [articleId, articleId],
  )
  const removable = mediaRows as BodyMediaRow[]
  const config = removable.length ? getOssConfig() : null
  for (const media of removable) await deleteOssObject(media.object_key, config!)

  await connection.execute('DELETE FROM article_images WHERE article_id = ?', [articleId])
  for (const media of removable) {
    await connection.execute(
      `UPDATE media_assets SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM articles cover_ref WHERE cover_ref.cover_media_id = media_assets.id)
         AND NOT EXISTS (SELECT 1 FROM article_images other_ref WHERE other_ref.media_id = media_assets.id)`,
      [media.id],
    )
  }
}

async function importArticle(
  source: AlbumSource,
  item: AlbumItem,
  categoryId: number,
): Promise<{ inserted: boolean; imageCount: number }> {
  const sourceId = Number(source.id)
  const existingItemArticle = await findExistingSourceItem(sourceId, item)
  if (!item.title.trim()) throw new Error(`文章 ${item.url} 缺少标题`)
  if (!item.publishedAt) throw new Error(`文章“${item.title}”缺少发布时间`)

  const identity = articleIdentity(item)

  /*
   * 封面优先级：文章页长图（msg_cdn_url，900x382）→ 专辑方图（cover_img_1_1，150x150）。
   *
   * 文章页抓取失败/被拦不能中断整次采集：readArticleLongCover 内部只告警并返回空串，
   * 这里自动退回专辑方图，与「封面处理失败改为无封面入库」的既有原则一致。
   *
   * 另外，封面缺失或下载失败时也**不中断整次采集**，而是以无封面方式入库：
   * 原来这里对空封面直接 throw，后果是：专辑里任意一篇文章封面不可用，
   * 整个来源（可能上百篇）立刻中止、游标不推进，下次重跑还会卡在同一篇。
   * 实测 tro-classic-album 与 tro-knowledge-album 就是因为各自一篇的封面
   * 取不到而整源失败。`articles.cover_media_id` 允许 NULL，writeArticle 接受
   * `cover: UploadedImage | null`，因此无封面入库是既有能力。
   */
  const longCoverUrl = await readArticleLongCover(identity.url)
  const coverIsLong = Boolean(longCoverUrl)
  const coverUrl = longCoverUrl || normalizeWechatImageUrl(item.coverUrl)
  let cover: UploadedImage | null = null
  if (!coverUrl) {
    console.warn('[wechat-album-import] 跳过封面（文章页与专辑都没有可读取地址）', {
      title: item.title,
      coverSource: item.coverUrl,
    })
  } else {
    try {
      cover = await uploadImage(coverUrl, `${item.title} 封面`)
    } catch (error) {
      console.warn('[wechat-album-import] 封面处理失败，改为无封面入库', {
        title: item.title,
        message: error instanceof Error ? error.message : String(error),
      })
      cover = null
    }
  }

  const existingArticle = existingItemArticle
    ? await findArticleById(existingItemArticle)
    : await findExistingArticle(identity.url) ?? await findLegacyArticle(item, categoryId)
  const result = await writeArticle(source, item, cover, coverIsLong, categoryId, existingArticle ? Number(existingArticle.id) : null)
  return { inserted: result.inserted, imageCount: cover ? 1 : 0 }
}

async function writeRunStart(source: AlbumSource, scheduledDate: string, mode: string): Promise<void> {
  await queryTarget(
    `INSERT INTO wechat_album_runs (source_id, scheduled_date, status, sync_mode, started_at, finished_at, error_message)
     VALUES (?, ?, 'running', ?, NOW(), NULL, '')
     ON DUPLICATE KEY UPDATE status = 'running', sync_mode = VALUES(sync_mode), started_at = NOW(),
       finished_at = NULL, fetched_count = 0, inserted_count = 0, duplicate_count = 0, image_count = 0,
       page_count = 0, error_message = '', updated_at = NOW()`,
    [source.id, scheduledDate, mode],
  )
}

async function finishRun(source: AlbumSource, scheduledDate: string, status: 'success' | 'failed', counts: ImportResult & { pageCount: number }, error = ''): Promise<void> {
  await queryTarget(
    `UPDATE wechat_album_runs SET status = ?, page_count = ?, fetched_count = ?, inserted_count = ?,
       duplicate_count = ?, image_count = ?, error_message = ?, finished_at = NOW(), updated_at = NOW()
     WHERE source_id = ? AND scheduled_date = ?`,
    [status, counts.pageCount, counts.fetchedCount, counts.insertedCount, counts.duplicateCount, counts.imageCount, error.slice(0, 1000), source.id, scheduledDate],
  )
}

async function updateSourceCursor(source: AlbumSource, latestItem: AlbumItem | null, full: boolean): Promise<void> {
  if (!latestItem?.messageId || !latestItem.itemIndex) throw new Error(`来源“${source.name}”没有有效的最新文章游标`)
  await queryTarget(
    `UPDATE wechat_album_sources SET cursor_message_id = ?, cursor_item_index = ?,
       initial_synced_at = IF(? = 1, NOW(), initial_synced_at),
       deployment_full_synced_at = IF(? = 1, COALESCE(deployment_full_synced_at, NOW()), deployment_full_synced_at),
       last_synced_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [latestItem.messageId, latestItem.itemIndex, full ? 1 : 0, full ? 1 : 0, source.id],
  )
}

async function importSource(source: AlbumSource, scheduledDate: string, deploymentFull = false): Promise<{ failed?: boolean; source: string; mode: string; result: ImportResult; pageCount?: number }> {
  const full = deploymentFull || !source.deployment_full_synced_at || !source.initial_synced_at
  const mode = full ? 'full' : 'incremental'
  const runMode = deploymentFull ? 'full_once' : mode
  const cursor = full ? null : { messageId: source.cursor_message_id, itemIndex: source.cursor_item_index }
  const empty: ImportResult = { fetchedCount: 0, insertedCount: 0, duplicateCount: 0, imageCount: 0 }
  await writeRunStart(source, scheduledDate, runMode)
  try {
    const crawl = await crawlWechatAlbum({
      sourceUrl: source.album_url,
      mode,
      cursor,
      // 固定页间隔：不再读取微信站点的抓取规则（校验已移除）
      pageDelayMs: PAGE_DELAY_MS,
      fetchFirstPage: (url: string) => fetchWechatText(url),
      fetchNextPage: (url: string, referer: string) => fetchWechatText(url, referer).then((body) => JSON.parse(body)),
    })
    if (!crawl.latestItem) throw new Error(`来源“${source.name}”没有解析到最新文章，游标未推进`)

    const result = { ...empty, fetchedCount: crawl.items.length, duplicateCount: crawl.duplicateCount }
    const categoryRows = await queryTarget<IdRow>('SELECT id FROM article_categories WHERE slug = ? AND status = 1 LIMIT 1', [source.category_slug])
    const categoryId = Number(categoryRows[0]?.id ?? 0)
    if (!categoryId) throw new Error(`目标文章分类不可用：${source.category_slug}`)

    for (const item of crawl.items as AlbumItem[]) {
      const imported = await importArticle(source, item, categoryId)
      result.insertedCount += imported.inserted ? 1 : 0
      result.duplicateCount += imported.inserted ? 0 : 1
      result.imageCount += imported.imageCount
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS))
    }

    await updateSourceCursor(source, crawl.latestItem as AlbumItem, full)
    await finishRun(source, scheduledDate, 'success', { ...result, pageCount: crawl.pageCount })
    console.info('[wechat-album-import] 专辑同步完成', { source: source.source_key, mode, ...result, pageCount: crawl.pageCount })
    return { source: source.source_key, mode, result, pageCount: crawl.pageCount }
  } catch (error) {
    const message = error instanceof Error ? error.message : '公众号文章同步失败'
    try { await finishRun(source, scheduledDate, 'failed', { ...empty, pageCount: 0 }, message) } catch (logError) {
      console.error('[wechat-album-import] 写入失败记录失败', logError)
    }
    console.error('[wechat-album-import] 专辑同步失败', { source: source.source_key, mode, message })
    return { source: source.source_key, mode, failed: true, result: empty }
  }
}

/** 从数据库读取全部启用来源；部署全量成功后，每日任务从游标增量同步。 */
async function runWechatAlbumImportMode(now: Date, deploymentFull: boolean) {
  if (!isOssConfigured()) throw new Error('公众号文章入库前必须配置 OSS，否则无法保存封面图片')
  const scheduledDate = wechatShanghaiDateKey(now)
  const pool = await getTargetPool()
  const lockConnection = await pool.getConnection()
  let hasLock = false
  try {
    const [lockRows] = await lockConnection.execute('SELECT GET_LOCK(?, 0) AS acquired', ['daxin:wechat-album:daily'])
    hasLock = Number((lockRows as Array<{ acquired?: number }>)[0]?.acquired ?? 0) === 1
    if (!hasLock) return { skipped: true, reason: 'another-run-is-active' }

    const sources = await queryTarget<AlbumSource>(
      `SELECT id, source_key, name, album_url, category_slug,
         cursor_message_id, cursor_item_index, initial_synced_at, deployment_full_synced_at
       FROM wechat_album_sources WHERE enabled = 1 ORDER BY id`,
    )
    if (!sources.length) throw new Error('没有已启用的公众号专辑来源，请先应用 022 号数据库迁移')

    const previous = await queryTarget<AlbumRun>(
      'SELECT source_id, status, sync_mode FROM wechat_album_runs WHERE scheduled_date = ?',
      [scheduledDate],
    )
    let pending: AlbumSource[]
    if (deploymentFull) {
      pending = sources.filter((source) => !source.deployment_full_synced_at || !source.initial_synced_at)
      if (!pending.length) return { skipped: true, reason: 'deployment-full-already-completed' }
    } else {
      const complete = new Set(previous
        .filter((row) => row.status === 'success' && row.sync_mode !== 'full_once')
        .map((row) => Number(row.source_id)))
      pending = sources.filter((source) => !complete.has(Number(source.id)))
      if (!pending.length) return { skipped: true, reason: 'already-completed-today' }
    }

    const results = []
    for (const source of pending) results.push(await importSource(source, scheduledDate, deploymentFull))
    const failedCount = results.filter((result) => result.failed).length
    return { scheduledDate, fullImport: deploymentFull, sourceCount: pending.length, failedCount, results, skipped: false }
  } finally {
    if (hasLock) {
      try { await lockConnection.execute('SELECT RELEASE_LOCK(?)', ['daxin:wechat-album:daily']) } catch (error) {
        console.error('[wechat-album-import] 释放任务锁失败', error)
      }
    }
    lockConnection.release()
  }
}

export function runWechatAlbumImport(now = new Date()) {
  return runWechatAlbumImportMode(now, false)
}

export function runWechatAlbumDeploymentFullImport(now = new Date()) {
  return runWechatAlbumImportMode(now, true)
}
