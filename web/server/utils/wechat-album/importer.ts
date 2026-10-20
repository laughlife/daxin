import { createHash, randomUUID } from 'node:crypto'
import { getTargetPool, type SqlConnection } from '../db/pool.ts'
import { queryTarget, withTargetTransaction } from '../db/query.ts'
import { getOssConfig, isOssConfigured } from '../oss/config.ts'
import { buildObjectKey, createPostObjectPolicy } from '../oss/policy.ts'
import { crawlWechatAlbum } from './crawler.mjs'
import { normalizeWechatImageUrl, wechatImageIdentity } from './content.mjs'
import { canonicalArticleUrl } from './parser.mjs'
import { isWechatRobotsAllowed, parseWechatRobots } from './robots.mjs'
import { wechatShanghaiDateKey } from './schedule.mjs'

const USER_AGENT = 'DaxinWechatAlbumSync/1.0 (+https://daxinfawu.com/)'
const MAX_PAGE_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const PAGE_DELAY_MS = 1000

type AlbumSource = {
  id: number | string
  source_key: string
  name: string
  album_url: string
  category_slug: string
  initial_mode: 'baseline' | 'latest' | 'full' | string
  initial_limit: number | string
  cursor_message_id: string
  cursor_item_index: string
  initial_synced_at: Date | string | null
}
type AlbumRun = { status: string }
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

type RobotsPolicy = ReturnType<typeof parseWechatRobots>

async function getRobotsPolicy(): Promise<RobotsPolicy> {
  const response = await fetch('https://mp.weixin.qq.com/robots.txt', {
    headers: { 'user-agent': USER_AGENT, accept: 'text/plain,*/*;q=0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  if (response.url && new URL(response.url).hostname !== 'mp.weixin.qq.com') {
    throw new Error('微信 robots.txt 跳转到了其他站点，本次采集已停止')
  }
  if (response.status === 404 || response.status === 410) return { rules: [], crawlDelayMs: 0 }
  if (!response.ok) throw new Error(`无法确认微信 robots.txt 规则（HTTP ${response.status}），本次采集已停止`)
  return parseWechatRobots(await readLimitedText(response, 64 * 1024, '微信 robots.txt'), USER_AGENT)
}

async function fetchWechatText(urlValue: string, robots: RobotsPolicy, referer?: string): Promise<string> {
  const url = assertWechatPageUrl(urlValue)
  if (!isWechatRobotsAllowed(robots, url.toString())) throw new Error(`robots.txt 不允许读取 ${url.pathname}，本次采集已停止`)
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

function imageFormat(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { mimeType: 'image/jpeg', extension: 'jpg' }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { mimeType: 'image/png', extension: 'png' }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' }
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)))) return { mimeType: 'image/gif', extension: 'gif' }
  return null
}

async function uploadImage(sourceUrl: string, label: string, robots: RobotsPolicy): Promise<UploadedImage> {
  const normalizedUrl = normalizeWechatImageUrl(sourceUrl)
  if (!normalizedUrl) throw new Error(`图片地址不在允许的微信图片域名中：${sourceUrl.slice(0, 180)}`)
  if (!isWechatRobotsAllowed(robots, normalizedUrl)) throw new Error('robots.txt 不允许读取微信图片，本次采集已停止')
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
  categoryId: number,
): Promise<{ articleId: number; inserted: boolean }> {
  const identity = articleIdentity(item)
  return withTargetTransaction(async (connection: SqlConnection) => {
    const [existingRows] = await connection.execute('SELECT id FROM articles WHERE slug = ? LIMIT 1', [identity.slug])
    let articleId = Number((existingRows as IdRow[])[0]?.id ?? 0)
    const inserted = articleId === 0
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
        [identity.slug, title, categoryId, cover?.id ?? null, publishedAt, identity.legacyId],
      )
      articleId = Number((header as DbHeader).insertId ?? 0)
      if (!articleId) throw new Error(`写入公众号文章失败：${title}`)
    } else {
      const [existing] = await connection.execute(
        'SELECT legacy_source_table FROM articles WHERE id = ? LIMIT 1',
        [articleId],
      )
      const existingSource = (existing as Array<{ legacy_source_table?: string | null }>)[0]?.legacy_source_table
      if (existingSource === 'wechat_album') {
        await connection.execute(
          `UPDATE articles SET title = ?, summary = NULL, content_html = NULL, content_text = NULL,
             category_id = ?, cover_media_id = COALESCE(cover_media_id, ?), published_at = ?,
             status = 'published', updated_at = NOW() WHERE id = ?`,
          [item.title.trim().slice(0, 255), categoryId, cover?.id ?? null, item.publishedAt, articleId],
        )
      }
    }

    await connection.execute(
      `INSERT INTO wechat_album_items
         (source_id, message_id, item_index, article_hash, article_id, source_url, title, cover_source_url, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE article_hash = VALUES(article_hash), article_id = VALUES(article_id),
         source_url = VALUES(source_url), title = VALUES(title), cover_source_url = VALUES(cover_source_url),
         published_at = VALUES(published_at), updated_at = NOW()`,
      [source.id, item.messageId, item.itemIndex, identity.hash, articleId, identity.url.slice(0, 2048), (article.title || item.title).slice(0, 255), (article.coverUrl || item.coverUrl || '').slice(0, 2048), article.publishedAt || item.publishedAt || null],
    )
    return { articleId, inserted }
  })
}

async function importArticle(
  source: AlbumSource,
  item: AlbumItem,
  robots: RobotsPolicy,
  categoryId: number,
): Promise<{ inserted: boolean; imageCount: number }> {
  const sourceId = Number(source.id)
  const existingItemArticle = await findExistingSourceItem(sourceId, item)
  if (existingItemArticle) return { inserted: false, imageCount: 0 }
  const identity = articleIdentity(item)
  const existingArticle = await findExistingArticle(identity.url)
  if (existingArticle) {
    let cover: UploadedImage | null = null
    if (existingArticle.legacy_source_table === 'wechat_album' && !existingArticle.cover_media_id && item.coverUrl) {
      cover = await uploadImage(item.coverUrl, `${item.title} 封面`, robots)
      await withTargetTransaction(async (connection) => {
        await connection.execute(
          `UPDATE articles SET cover_media_id = ?, title = ?, summary = NULL, content_html = NULL,
             content_text = NULL, category_id = ?, published_at = ?, status = 'published', updated_at = NOW()
           WHERE id = ? AND legacy_source_table = 'wechat_album'`,
          [cover?.id ?? null, item.title.trim().slice(0, 255), categoryId, item.publishedAt || null, existingArticle.id],
        )
      })
    }
    await withTargetTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO wechat_album_items
           (source_id, message_id, item_index, article_hash, article_id, source_url, title, cover_source_url, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE article_id = VALUES(article_id), article_hash = VALUES(article_hash), updated_at = NOW()`,
        [sourceId, item.messageId, item.itemIndex, identity.hash, existingArticle.id, identity.url.slice(0, 2048), item.title.slice(0, 255), item.coverUrl.slice(0, 2048), item.publishedAt || null],
      )
    })
    return { inserted: false, imageCount: cover ? 1 : 0 }
  }

  if (!item.title.trim()) throw new Error(`文章 ${identity.url} 缺少标题`)
  if (!item.publishedAt) throw new Error(`文章“${item.title}”缺少发布时间`)
  const coverUrl = normalizeWechatImageUrl(item.coverUrl)
  if (!coverUrl) throw new Error(`文章“${item.title}”没有可读取的封面图片`)

  const cover = await uploadImage(coverUrl, `${item.title} 封面`, robots)
  const result = await writeArticle(source, item, cover, categoryId)
  return { inserted: result.inserted, imageCount: 1 }
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

async function updateSourceCursor(source: AlbumSource, latestItem: AlbumItem | null, initial: boolean): Promise<void> {
  if (!latestItem?.messageId || !latestItem.itemIndex) throw new Error(`来源“${source.name}”没有有效的最新文章游标`)
  await queryTarget(
    `UPDATE wechat_album_sources SET cursor_message_id = ?, cursor_item_index = ?,
       initial_synced_at = IF(? = 1, NOW(), initial_synced_at), last_synced_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [latestItem.messageId, latestItem.itemIndex, initial ? 1 : 0, source.id],
  )
}

async function importSource(source: AlbumSource, robots: RobotsPolicy, scheduledDate: string): Promise<{ failed?: boolean; source: string; mode: string; result: ImportResult; pageCount?: number }> {
  const initial = !source.initial_synced_at
  const mode = initial ? 'full' : 'incremental'
  const pageDelayMs = Math.max(PAGE_DELAY_MS, robots.crawlDelayMs)
  const limit = 0
  const cursor = initial ? null : { messageId: source.cursor_message_id, itemIndex: source.cursor_item_index }
  const empty: ImportResult = { fetchedCount: 0, insertedCount: 0, duplicateCount: 0, imageCount: 0 }
  await writeRunStart(source, scheduledDate, mode)
  try {
    const crawl = await crawlWechatAlbum({
      sourceUrl: source.album_url,
      mode,
      limit,
      cursor,
      pageDelayMs,
      fetchFirstPage: (url: string) => fetchWechatText(url, robots),
      fetchNextPage: (url: string, referer: string) => fetchWechatText(url, robots, referer).then((body) => JSON.parse(body)),
    })
    if (!crawl.latestItem) throw new Error(`来源“${source.name}”没有解析到最新文章，游标未推进`)

    const result = { ...empty, fetchedCount: crawl.items.length, duplicateCount: crawl.duplicateCount }
    const categoryRows = await queryTarget<IdRow>('SELECT id FROM article_categories WHERE slug = ? AND status = 1 LIMIT 1', [source.category_slug])
    const categoryId = Number(categoryRows[0]?.id ?? 0)
    if (!categoryId) throw new Error(`目标文章分类不可用：${source.category_slug}`)
    for (const item of crawl.items as AlbumItem[]) {
      const imported = await importArticle(source, item, robots, categoryId)
      result.insertedCount += imported.inserted ? 1 : 0
      result.duplicateCount += imported.inserted ? 0 : 1
      result.imageCount += imported.imageCount
      await new Promise((resolve) => setTimeout(resolve, Math.max(PAGE_DELAY_MS, robots.crawlDelayMs)))
    }

    await updateSourceCursor(source, crawl.latestItem as AlbumItem, initial)
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

/** 五个公开专辑首次全量同步；来源游标成功落库后，之后每日只取新增文章。 */
export async function runWechatAlbumImport(now = new Date()) {
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
      `SELECT id, source_key, name, album_url, category_slug, initial_mode, initial_limit,
         cursor_message_id, cursor_item_index, initial_synced_at
       FROM wechat_album_sources WHERE enabled = 1 ORDER BY id`,
    )
    if (!sources.length) throw new Error('没有已启用的公众号专辑来源，请先应用 022 号数据库迁移')

    const previous = await queryTarget<{ source_id: number | string; status: string }>(
      'SELECT source_id, status FROM wechat_album_runs WHERE scheduled_date = ?',
      [scheduledDate],
    )
    const complete = new Set(previous.filter((row) => row.status === 'success').map((row) => Number(row.source_id)))
    const pending = sources.filter((source) => !complete.has(Number(source.id)))
    if (!pending.length) return { skipped: true, reason: 'already-completed-today' }

    const robots = await getRobotsPolicy()
    const results = []
    for (const source of pending) results.push(await importSource(source, robots, scheduledDate))
    const failedCount = results.filter((result) => result.failed).length
    return { scheduledDate, sourceCount: pending.length, failedCount, results, skipped: false }
  } finally {
    if (hasLock) {
      try { await lockConnection.execute('SELECT RELEASE_LOCK(?)', ['daxin:wechat-album:daily']) } catch (error) {
        console.error('[wechat-album-import] 释放任务锁失败', error)
      }
    }
    lockConnection.release()
  }
}
