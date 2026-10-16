import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDxfwAttachmentUrl } from './legacy-source.mjs'
import { extensionFromContentType, mediaObjectKeyFor } from './legacy-oss-migration.mjs'
import { executeSqlBatch, queryObjects, queryRows, queryRowsBatch, quoteLiteral, readEnvFile, resolveTargetConnection } from './mysql-client.mjs'

const MAX_COVER_BYTES = 20 * 1024 * 1024
const EXPECTED_MIGRATED_ARTICLES = 858
const COVER_SOURCE_HOST = 'daxinfawu.com'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')

function positiveId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function normalizedUploadPath(value) {
  try {
    const url = new URL(String(value ?? ''))
    const decoded = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!decoded.toLowerCase().startsWith('uploadfile/')) return ''
    return decoded.slice('uploadfile/'.length)
  } catch {
    return ''
  }
}

/** 只允许旧官网 HTTPS uploadfile 图片，拒绝外域、查询参数与路径穿越。 */
export function isAllowedCoverSourceUrl(value) {
  try {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== COVER_SOURCE_HOST) return false
    if (url.port || url.username || url.password || url.search || url.hash) return false
    const path = decodeURIComponent(url.pathname)
    if (!path.startsWith('/uploadfile/')) return false
    const segments = path.split('/')
    return segments.length >= 3 && segments.every(segment => segment !== '.' && segment !== '..' && !segment.includes('\\'))
  } catch {
    return false
  }
}

function normalizeDirectCoverUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (url.hostname.toLowerCase() !== COVER_SOURCE_HOST) return ''
    if (url.protocol === 'http:') url.protocol = 'https:'
    return isAllowedCoverSourceUrl(url.href) ? url.href : ''
  } catch {
    return ''
  }
}

/** 按旧文 URL 的路径建立 OSS 映射索引，兼容旧域名与 https 规范域名。 */
export function buildMediaPathIndex(mediaMap = {}) {
  const index = new Map()
  for (const [sourceUrl, mapped] of Object.entries(mediaMap ?? {})) {
    if (!mapped?.objectKey || !mapped?.publicUrl) continue
    const path = normalizedUploadPath(sourceUrl)
    if (!path) continue
    const current = index.get(path)
    if (!current) index.set(path, { ...mapped })
    else if (current.objectKey !== mapped.objectKey || current.publicUrl !== mapped.publicUrl) index.set(path, null)
  }
  return index
}

export function resolveMappedCover(sourceUrl, pathIndex) {
  if (!isAllowedCoverSourceUrl(sourceUrl)) return null
  const mapped = pathIndex?.get(normalizedUploadPath(sourceUrl))
  return mapped?.objectKey && mapped?.publicUrl ? { ...mapped } : null
}

/** 纯函数：把目标迁移文章和旧站附件表路径配对，按附件 URL 去重。 */
export function buildArticleCoverPlan({ articles = [], sourceRows = [] } = {}) {
  const sourceById = new Map(sourceRows.map(row => [String(row.id ?? ''), row]))
  const attachments = new Map()
  let alreadyBoundCount = 0
  let missingSourceCount = 0
  let missingAttachmentCount = 0
  let referenceCount = 0
  let directUrlReferenceCount = 0

  for (const article of articles) {
    if (positiveId(article.cover_media_id)) {
      alreadyBoundCount += 1
      continue
    }
    const sourceId = String(article.source_id ?? article.legacy_source_id ?? '').trim()
    const source = sourceById.get(sourceId)
    if (!source) {
      missingSourceCount += 1
      continue
    }
    const attachmentId = positiveId(source.attachment_id ?? source.thumb)
    let sourceUrl = attachmentId ? buildDxfwAttachmentUrl(source.attachment) : ''
    let sourceKind = 'attachment'
    if (sourceUrl && !isAllowedCoverSourceUrl(sourceUrl)) sourceUrl = ''
    if (!sourceUrl) {
      sourceUrl = normalizeDirectCoverUrl(source.thumb)
      sourceKind = 'direct_url'
      if (sourceUrl) directUrlReferenceCount += 1
    }
    if (!sourceUrl || (!attachmentId && sourceKind !== 'direct_url')) {
      missingAttachmentCount += 1
      continue
    }

    referenceCount += 1
    const entry = attachments.get(sourceUrl) ?? {
      sourceUrl,
      relativePath: normalizedUploadPath(sourceUrl),
      attachmentId,
      sourceKind,
      articleIds: [],
      sourceIds: [],
    }
    entry.articleIds.push(positiveId(article.article_id ?? article.id))
    entry.sourceIds.push(positiveId(sourceId))
    attachments.set(sourceUrl, entry)
  }

  return {
    targetArticleCount: articles.length,
    alreadyBoundCount,
    referenceCount,
    uniqueAttachmentCount: attachments.size,
    directUrlReferenceCount,
    missingSourceCount,
    missingAttachmentCount,
    attachments: [...attachments.values()],
  }
}

/** 从原 OSS media map 读取附件路径匹配结果；不依赖源 URL 的 scheme 或 host。 */
export function countMappedCoverAttachments(attachments, pathIndex) {
  return attachments.filter(item => resolveMappedCover(item.sourceUrl, pathIndex)).length
}

export function parseCoverBackfillArgs(args = []) {
  const option = (name, fallback) => {
    const index = args.indexOf(name)
    return index < 0 ? fallback : (args[index + 1] ?? fallback)
  }
  const concurrency = Number.parseInt(option('--concurrency', '4'), 10)
  return {
    apply: args.includes('--apply'),
    concurrency: Math.max(1, Math.min(8, Number.isFinite(concurrency) ? concurrency : 4)),
    mediaMapPath: resolve(ROOT, option('--media-map', 'tmp/dxfw-media-map.json')),
    statePath: resolve(ROOT, option('--state', 'tmp/dxfw-article-cover-backfill.json')),
    reportPath: resolve(ROOT, option('--report', 'tmp/dxfw-article-cover-backfill-report.json')),
    sourceId: positiveId(option('--source-id', '')) || null,
  }
}

async function readJson(path, fallback = {}) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

function sourceRowsQuery(sourceIds) {
  const ids = [...new Set(sourceIds.map(positiveId).filter(Boolean))]
  if (!ids.length) return ''
  return `SELECT n.id, n.thumb, CAST(n.thumb AS UNSIGNED) AS attachment_id, d.attachment
FROM dxfw.dr_1_news n
LEFT JOIN dxfw.dr_attachment_data d ON d.id = CAST(n.thumb AS UNSIGNED)
WHERE n.id IN (${ids.join(', ')})`
}

async function readCoverCandidates(target, sourceId = null) {
  const articles = await queryObjects(target, `SELECT a.id AS article_id, a.legacy_source_id AS source_id,
  CASE WHEN bound.id IS NOT NULL THEN a.cover_media_id ELSE NULL END AS cover_media_id
FROM articles a
LEFT JOIN media_assets bound ON bound.id = a.cover_media_id
  AND bound.usage_scope = 'article' AND bound.deleted_at IS NULL
WHERE a.legacy_source_table = 'dr_1_news'
${sourceId ? `AND a.legacy_source_id = ${sourceId}` : ''}
ORDER BY a.id`)
  const ids = articles.map(row => positiveId(row.source_id)).filter(Boolean)
  const sourceSql = sourceRowsQuery(ids)
  const sourceRows = sourceSql ? await queryObjects(target, sourceSql) : []
  return { articles, sourceRows }
}

async function readMediaRowsByObjectKey(target, objectKeys) {
  const rows = []
  for (let index = 0; index < objectKeys.length; index += 120) {
    const batch = objectKeys.slice(index, index + 120)
    if (!batch.length) continue
    rows.push(...await queryObjects(target, `SELECT id, object_key, public_url, usage_scope, deleted_at
FROM media_assets WHERE object_key IN (${batch.map(quoteLiteral).join(', ')})`))
  }
  return rows
}

function readOssConfig() {
  const env = readEnvFile(resolve(ROOT, 'web/.env'))
  const accessKeyId = String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim()
  const accessKeySecret = String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim()
  const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
  const endpoint = String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*/, '')
  const publicBase = String(env.ALIYUN_OSS_PUBLIC_BASE_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || `${bucket}.${endpoint}`
  if (!accessKeyId || !accessKeySecret || !bucket || !endpoint || !publicBase) throw new Error('OSS 配置不完整，无法执行封面上传')
  return { accessKeyId, accessKeySecret, bucket, endpoint, publicBase, host: `https://${bucket}.${endpoint}` }
}

function shanghaiDateFolder(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  return parts.filter(part => part.type !== 'literal').map(part => part.value).join('')
}

async function readImageLimited(response) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_COVER_BYTES) throw new Error(`封面图片超过 20 MB：${declared} bytes`)
  const chunks = []
  let total = 0
  if (!response.body) throw new Error('旧站图片响应为空')
  for await (const chunk of response.body) {
    total += chunk.length
    if (total > MAX_COVER_BYTES) throw new Error('封面图片超过 20 MB')
    chunks.push(Buffer.from(chunk))
  }
  if (total === 0) throw new Error('旧站图片内容为空')
  return Buffer.concat(chunks, total)
}

async function downloadLegacyCover(sourceUrl) {
  if (!isAllowedCoverSourceUrl(sourceUrl)) throw new Error('旧站封面地址不在官网 uploadfile 目录')
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DaxinCoverMigration/1.0)' },
    redirect: 'error',
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) throw new Error(`旧站图片 HTTP ${response.status}`)
  const mimeType = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const extension = extensionFromContentType(mimeType)
  if (!mimeType.startsWith('image/') || !extension) throw new Error(`旧站响应不是支持的图片：${mimeType || 'unknown'}`)
  return { body: await readImageLimited(response), mimeType, extension }
}

async function putOssObject(oss, objectKey, body, contentType) {
  const date = new Date().toUTCString()
  const resource = `/${oss.bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', oss.accessKeySecret).update(stringToSign).digest('base64')
  const response = await fetch(`${oss.host}/${objectKey}`, {
    method: 'PUT',
    headers: {
      Date: date,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      Authorization: `OSS ${oss.accessKeyId}:${signature}`,
    },
    body,
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok) throw new Error(`OSS 上传 HTTP ${response.status}`)
}

export async function writeCheckpointSnapshot(path, value) {
  const directory = `${path}.snapshots`
  await mkdir(directory, { recursive: true })
  const sequence = positiveId(value.checkpointSequence) || 1
  const finalPath = join(directory, `${String(sequence).padStart(8, '0')}-${randomUUID()}.json`)
  const payload = `${JSON.stringify({ ...value, checkpointSequence: sequence }, null, 2)}\n`
  // Every snapshot has a new path and is never overwritten. A reader that sees the directory
  // entry before the write closes will fail JSON parsing and fall back to the previous snapshot.
  await writeFile(finalPath, payload, { encoding: 'utf8', flag: 'wx' })
  return { ...value, checkpointSequence: sequence }
}

export async function readLatestCheckpoint(path) {
  const directory = `${path}.snapshots`
  try {
    const names = (await readdir(directory)).filter(name => /^\d{8}-[0-9a-f-]+\.json$/i.test(name)).sort().reverse()
    for (const name of names) {
      try { return JSON.parse(await readFile(join(directory, name), 'utf8')) } catch {}
    }
  } catch {}
  return readJson(path, {})
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

function mediaInsertStatement(item, mapped) {
  return `INSERT INTO media_assets
  (object_key, public_url, file_name, mime_type, byte_size, usage_scope, title, legacy_source_table, legacy_source_id)
VALUES
  (${quoteLiteral(mapped.objectKey)}, ${quoteLiteral(mapped.publicUrl)}, ${quoteLiteral(item.relativePath.split('/').pop() ?? '')},
   ${quoteLiteral(mapped.mimeType ?? '')}, ${Number(mapped.byteSize) || 0}, 'article', '旧站文章封面', 'dr_attachment_data', ${item.attachmentId})
ON DUPLICATE KEY UPDATE
  public_url = VALUES(public_url), file_name = VALUES(file_name), mime_type = VALUES(mime_type),
  byte_size = VALUES(byte_size), usage_scope = 'article', title = VALUES(title),
  legacy_source_table = VALUES(legacy_source_table), legacy_source_id = VALUES(legacy_source_id),
  deleted_at = NULL, updated_at = NOW()`
}

async function fetchAndUploadAttachments(attachments, { state, statePath, mediaPathIndex, oss, dateFolder, concurrency }) {
  const failures = []
  let uploadedCount = 0
  const mapped = new Map()
  let checkpoint = Promise.resolve()
  const saveCheckpoint = () => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.checkpointSequence = (Number(state.checkpointSequence) || 0) + 1
    state.checkpointSequence = snapshot.checkpointSequence
    checkpoint = checkpoint.then(() => writeCheckpointSnapshot(statePath, snapshot))
    return checkpoint
  }
  await runPool(attachments, concurrency, async (item) => {
    try {
      const existing = state.mediaMap[item.sourceUrl] ?? resolveMappedCover(item.sourceUrl, mediaPathIndex)
      if (existing?.objectKey && existing?.publicUrl) {
        const result = { ...existing }
        state.mediaMap[item.sourceUrl] = result
        mapped.set(item.sourceUrl, result)
        return
      }
      const image = await downloadLegacyCover(item.sourceUrl)
      const baseKey = mediaObjectKeyFor(item.sourceUrl, dateFolder)
      const objectKey = baseKey.replace(/\.[^.]+$/, image.extension)
      await putOssObject(oss, objectKey, image.body, image.mimeType)
      const result = {
        objectKey,
        publicUrl: `https://${oss.publicBase}/${objectKey}`,
        fileName: item.relativePath.split('/').pop() ?? 'cover',
        mimeType: image.mimeType,
        byteSize: image.body.length,
      }
      state.mediaMap[item.sourceUrl] = result
      state.uploaded = (state.uploaded ?? 0) + 1
      uploadedCount += 1
      mapped.set(item.sourceUrl, result)
      if (uploadedCount % 100 === 0) console.log(`封面上传进度 ${uploadedCount}/${attachments.length}`)
      if (uploadedCount % 20 === 0) await saveCheckpoint()
    } catch (error) {
      failures.push({ sourceUrl: item.sourceUrl, error: String(error?.message ?? error) })
    }
  })
  await checkpoint
  return { mapped, failures, uploadedCount }
}

async function bindCovers(target, attachments, mappedByUrl) {
  const bindFailures = []
  const reusable = []
  const objectKeys = [...new Set(attachments
    .map(item => mappedByUrl.get(item.sourceUrl)?.objectKey)
    .filter(Boolean))]
  const mediaRows = await readMediaRowsByObjectKey(target, objectKeys)
  const mediaByObjectKey = new Map(mediaRows.map(row => [row.object_key, row]))

  for (const item of attachments) {
    const mapped = mappedByUrl.get(item.sourceUrl)
    if (!mapped) continue
    const existing = mediaByObjectKey.get(mapped.objectKey)
    if (existing && existing.usage_scope !== 'article') {
      bindFailures.push({ sourceUrl: item.sourceUrl, error: `媒体对象已登记为 ${existing.usage_scope} 用途，未覆盖` })
      continue
    }
    reusable.push({ item, mapped })
  }

  const upserts = reusable
    .filter(({ mapped }) => !mediaByObjectKey.has(mapped.objectKey) || mediaByObjectKey.get(mapped.objectKey)?.deleted_at)
    .map(({ item, mapped }) => mediaInsertStatement(item, mapped))
  await executeSqlBatch(target, upserts, { concurrency: 8, maxBatchStatements: 50 })

  const uniqueObjectKeys = [...new Set(reusable.map(({ mapped }) => mapped.objectKey))]
  const idRows = await queryRowsBatch(target, uniqueObjectKeys.map(key => `SELECT id FROM media_assets
WHERE object_key = ${quoteLiteral(key)} AND usage_scope = 'article' AND deleted_at IS NULL LIMIT 1`), { concurrency: 12 })
  const mediaIdByObjectKey = new Map(uniqueObjectKeys.map((key, index) => [key, positiveId(idRows[index]?.[0]?.[0])]))
  const statements = []
  for (const { item, mapped } of reusable) {
    const mediaId = mediaIdByObjectKey.get(mapped.objectKey)
    if (!mediaId) {
      bindFailures.push({ sourceUrl: item.sourceUrl, error: 'OSS 图片未能登记为有效文章媒体' })
      continue
    }
    for (let index = 0; index < item.articleIds.length; index += 1) {
      const articleId = positiveId(item.articleIds[index])
      const sourceId = positiveId(item.sourceIds[index])
      if (!articleId || !sourceId) continue
      statements.push(`UPDATE articles SET cover_media_id = ${mediaId}, updated_at = NOW()
WHERE id = ${articleId} AND legacy_source_table = 'dr_1_news' AND legacy_source_id = ${sourceId}
  AND cover_media_id IS NULL`)
    }
  }
  await executeSqlBatch(target, statements, { concurrency: 8, maxBatchStatements: 80 })
  return { boundArticleCount: statements.length, bindFailures }
}

export async function runCoverBackfill(args = process.argv.slice(2)) {
  const options = parseCoverBackfillArgs(args)
  const target = resolveTargetConnection()
  if (!target) throw new Error('缺少目标数据库连接配置')
  const { articles, sourceRows } = await readCoverCandidates(target, options.sourceId)
  const plan = buildArticleCoverPlan({ articles, sourceRows })
  const priorMediaFile = await readJson(options.mediaMapPath)
  const existingMediaMap = priorMediaFile.mediaMap ?? priorMediaFile
  const mediaPathIndex = buildMediaPathIndex(existingMediaMap)
  const mappedExistingCount = countMappedCoverAttachments(plan.attachments, mediaPathIndex)
  const priorState = await readLatestCheckpoint(options.statePath)
  const state = {
    dateFolder: priorState.dateFolder || shanghaiDateFolder(),
    uploaded: Number(priorState.uploaded) || 0,
    checkpointSequence: Number(priorState.checkpointSequence) || 0,
    mediaMap: priorState.mediaMap && typeof priorState.mediaMap === 'object' ? priorState.mediaMap : {},
  }
  const checkpointMappedUrls = new Set(plan.attachments
    .filter(item => state.mediaMap[item.sourceUrl]?.objectKey && state.mediaMap[item.sourceUrl]?.publicUrl)
    .map(item => item.sourceUrl))
  const existingMappedUrls = new Set(plan.attachments
    .filter(item => resolveMappedCover(item.sourceUrl, mediaPathIndex))
    .map(item => item.sourceUrl))
  const allMappedUrls = new Set([...checkpointMappedUrls, ...existingMappedUrls])
  const mappedObjectKeys = new Set(plan.attachments.flatMap((item) => {
    const mapped = state.mediaMap[item.sourceUrl] ?? resolveMappedCover(item.sourceUrl, mediaPathIndex)
    return mapped?.objectKey && mapped?.publicUrl ? [mapped.objectKey] : []
  }))
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    sourceId: options.sourceId,
    targetArticleCount: plan.targetArticleCount,
    validAlreadyBoundCount: plan.alreadyBoundCount,
    articleCoverReferences: plan.referenceCount,
    directUrlCoverReferences: plan.directUrlReferenceCount,
    uniqueAttachmentPaths: plan.uniqueAttachmentCount,
    existingOssPathMatches: mappedExistingCount,
    resumableCheckpointMappings: checkpointMappedUrls.size,
    needDownloadCount: plan.uniqueAttachmentCount - allMappedUrls.size,
    missingSourceCount: plan.missingSourceCount,
    missingAttachmentCount: plan.missingAttachmentCount,
    dateFolder: state.dateFolder,
    uploadedThisRun: 0,
    boundArticleCount: 0,
    failures: [],
  }

  if (!options.apply) {
    const mapKeys = [...mappedObjectKeys]
    const existingRows = await readMediaRowsByObjectKey(target, mapKeys)
    summary.alreadyRegisteredMediaCount = existingRows.filter(row => row.usage_scope === 'article' && !row.deleted_at).length
    summary.mediaObjectsToRegister = Math.max(0, mapKeys.length - summary.alreadyRegisteredMediaCount)
    await saveJson(options.reportPath, summary)
    console.log(JSON.stringify(summary, null, 2))
    console.log(`预演报告：${options.reportPath}`)
    return summary
  }

  if (options.sourceId && plan.targetArticleCount === 0) {
    throw new Error(`没有找到旧站来源文章 ${options.sourceId}，未执行写入`)
  }
  if (!options.sourceId && plan.targetArticleCount !== EXPECTED_MIGRATED_ARTICLES) {
    throw new Error(`目标迁移文章数应为 ${EXPECTED_MIGRATED_ARTICLES}，实际 ${plan.targetArticleCount}；为避免误写已停止`)
  }
  const oss = readOssConfig()
  state.dateFolder = priorState.dateFolder || shanghaiDateFolder()
  Object.assign(state, await writeCheckpointSnapshot(options.statePath, state))
  const uploadResult = await fetchAndUploadAttachments(plan.attachments, {
    state,
    statePath: options.statePath,
    mediaPathIndex,
    oss,
    dateFolder: state.dateFolder,
    concurrency: options.concurrency,
  })
  summary.uploadedThisRun = uploadResult.uploadedCount
  summary.failures.push(...uploadResult.failures)

  const uploaded = await bindCovers(target, plan.attachments, uploadResult.mapped)
  summary.boundArticleCount = uploaded.boundArticleCount
  summary.failures.push(...uploaded.bindFailures)
  summary.unboundArticleReferences = plan.referenceCount - uploaded.boundArticleCount
  await saveJson(options.reportPath, summary)
  state.checkpointSequence = (Number(state.checkpointSequence) || 0) + 1
  Object.assign(state, await writeCheckpointSnapshot(options.statePath, state))
  console.log(JSON.stringify(summary, null, 2))
  console.log(`回填报告：${options.reportPath}`)
  if (summary.failures.length) process.exitCode = 1
  return summary
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCoverBackfill().catch((error) => {
    console.error(`文章封面回填失败：${error.message}`)
    process.exitCode = 1
  })
}
