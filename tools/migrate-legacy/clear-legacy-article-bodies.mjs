// 将 dxfw.dr_1_news.url 按 legacy_source_id 回填到 daxin，并清理正文与专属正文图片。
// 默认只输出计划；只有显式传入 --apply 才会修改数据库和删除 OSS 对象。
import { createHmac } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { executeSql, queryObjects, readEnvFile, resolveTargetConnection } from './mysql-client.mjs'

const APPLY = process.argv.includes('--apply')
const LEGACY_HOST = 'daxinfawu.com'
const LEGACY_PATH = /^\/(?:case|crossing|domestic|dynamic|news|overseas|tro)\/\d+\.html$/i
const env = readEnvFile()
const db = resolveTargetConnection()
if (!db) throw new Error('缺少新库连接配置')

const sourceRows = await queryObjects(db, `
SELECT n.id AS source_id, n.url, a.id AS article_id, a.original_url,
       CHAR_LENGTH(COALESCE(a.content_html, '')) AS html_length,
       CHAR_LENGTH(COALESCE(a.content_text, '')) AS text_length
FROM dxfw.dr_1_news n
LEFT JOIN daxin.articles a
  ON a.legacy_source_table = 'dr_1_news' AND a.legacy_source_id = n.id
ORDER BY n.id`)

const targetRows = await queryObjects(db, `
SELECT id FROM daxin.articles WHERE legacy_source_table = 'dr_1_news'`)

if (sourceRows.length !== 858 || targetRows.length !== sourceRows.length) {
  throw new Error(`文章数量不符合预期：旧库 ${sourceRows.length} 篇，新库映射 ${targetRows.length} 篇；停止修改`)
}

const mappedArticleIds = new Set()
let bodyCount = 0
const conflicts = []
for (const row of sourceRows) {
  const sourceId = Number(row.source_id)
  const articleId = Number(row.article_id)
  const oldPath = String(row.url ?? '')
  const expectedUrl = `https://${LEGACY_HOST}${oldPath}`
  if (!Number.isInteger(articleId) || articleId <= 0 || mappedArticleIds.has(articleId)) {
    throw new Error(`旧文章 ${sourceId} 未映射或映射重复；停止修改`)
  }
  if (!LEGACY_PATH.test(oldPath)) throw new Error(`旧文章 ${sourceId} 的原文路径格式异常；停止修改`)
  mappedArticleIds.add(articleId)
  if (row.original_url && row.original_url !== expectedUrl) conflicts.push(sourceId)
  if (Number(row.html_length) > 0 || Number(row.text_length) > 0) bodyCount += 1
}
if (conflicts.length) throw new Error(`新库已有不同原文链接的文章 ${conflicts.slice(0, 10).join(', ')}；停止覆盖`)

const assets = await queryObjects(db, `
SELECT DISTINCT m.id AS media_id, m.object_key
FROM daxin.article_images ai
JOIN daxin.articles a ON a.id = ai.article_id
JOIN daxin.media_assets m ON m.id = ai.media_id
WHERE a.legacy_source_table = 'dr_1_news'
  AND m.deleted_at IS NULL
  AND m.object_key LIKE 'Img/%'
  AND NOT EXISTS (
    SELECT 1 FROM daxin.articles cover
    JOIN daxin.media_assets cover_media ON cover_media.id = cover.cover_media_id
    WHERE cover_media.object_key = m.object_key
  )
  AND NOT EXISTS (
    SELECT 1 FROM daxin.article_images other_image
    JOIN daxin.articles other_article ON other_article.id = other_image.article_id
    JOIN daxin.media_assets other_media ON other_media.id = other_image.media_id
    WHERE other_media.object_key = m.object_key
      AND other_article.legacy_source_table <> 'dr_1_news'
  )
  AND NOT EXISTS (
    SELECT 1 FROM daxin.media_assets duplicate_media
    WHERE duplicate_media.object_key = m.object_key AND duplicate_media.id <> m.id
  )
ORDER BY m.id`)

const linkedImageCount = await queryObjects(db, `
SELECT COUNT(*) AS total
FROM daxin.article_images ai
JOIN daxin.articles a ON a.id = ai.article_id
WHERE a.legacy_source_table = 'dr_1_news'`)

console.log(`旧库文章：${sourceRows.length} 篇；新库一对一映射：${mappedArticleIds.size} 篇`)
console.log(`含正文文章：${bodyCount} 篇；正文图片关联：${Number(linkedImageCount[0]?.total ?? 0)} 条`)
console.log(`可安全删除的独立正文 OSS 对象：${assets.length} 个（排除所有封面、跨文章引用和重复对象键）`)
if (!APPLY) {
  console.log('当前为只读预览；确认范围后使用 --apply 执行。')
  process.exit(0)
}

const oss = {
  accessKeyId: String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim(),
  accessKeySecret: String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim(),
  endpoint: String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
  bucket: String(env.ALIYUN_OSS_BUCKET ?? '').trim(),
}
if (!oss.accessKeyId || !oss.accessKeySecret || !oss.endpoint || !oss.bucket) {
  throw new Error('OSS 配置不完整；未修改数据')
}
for (const asset of assets) {
  const key = String(asset.object_key ?? '')
  if (!key.startsWith('Img/') || key.split('/').some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f\\]/.test(key)) {
    throw new Error(`正文图片对象键无效：media_id=${asset.media_id}；未修改数据`)
  }
}

await executeSql(db, `
UPDATE daxin.articles a
JOIN dxfw.dr_1_news n
  ON a.legacy_source_table = 'dr_1_news' AND a.legacy_source_id = n.id
SET a.original_url = CONCAT('https://${LEGACY_HOST}', n.url),
    a.content_html = '',
    a.content_text = '',
    a.updated_at = NOW()
WHERE n.url REGEXP '^/(case|crossing|domestic|dynamic|news|overseas|tro)/[0-9]+[.]html$'`)

function signedDeleteRequest(objectKey) {
  const date = new Date().toUTCString()
  const resource = `/${oss.bucket}/${objectKey}`
  const signature = createHmac('sha1', oss.accessKeySecret)
    .update(['DELETE', '', '', date, resource].join('\n'), 'utf8')
    .digest('base64')
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  return {
    url: `https://${oss.bucket}.${oss.endpoint}/${encodedKey}`,
    headers: { Date: date, Authorization: `OSS ${oss.accessKeyId}:${signature}` },
  }
}

async function deleteObject(objectKey) {
  const request = signedDeleteRequest(objectKey)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(request.url, {
        method: 'DELETE',
        headers: request.headers,
        signal: AbortSignal.timeout(30000),
      })
      if (response.status === 404 || response.ok) return
      if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status}`)
      if (attempt === 3) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (attempt === 3 || /^HTTP 4\d\d$/.test(String(error?.message))) throw error
    }
    await delay(300 * (2 ** attempt))
  }
}

let cursor = 0
let completed = 0
let stopped = false
const failures = []
const workers = Array.from({ length: Math.min(10, assets.length) }, async () => {
  while (cursor < assets.length && !stopped) {
    const asset = assets[cursor++]
    try {
      await deleteObject(String(asset.object_key))
    } catch (error) {
      failures.push({ mediaId: Number(asset.media_id), objectKey: String(asset.object_key), error: String(error?.message ?? error) })
      if (String(error?.message ?? '').includes('HTTP 403')) stopped = true
    }
    completed += 1
    if (completed % 500 === 0 || completed === assets.length) {
      console.log(`OSS 清理进度：${completed}/${assets.length}，失败 ${failures.length}`)
    }
  }
})
await Promise.all(workers)

if (failures.length) {
  console.error(`OSS 有 ${failures.length} 个对象未能确认删除；正文已清空、链接已回填。保留图片关联以便安全重试。`)
  for (const failure of failures.slice(0, 10)) console.error(`${failure.mediaId}\t${failure.objectKey}\t${failure.error}`)
  process.exitCode = 1
} else {
  const articleIds = [...mappedArticleIds]
  const mediaIds = assets.map(asset => Number(asset.media_id))
  const mediaCleanup = mediaIds.length ? `
UPDATE daxin.media_assets m
SET m.deleted_at = NOW(), m.updated_at = NOW()
WHERE m.id IN (${mediaIds.join(',')})
  AND m.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM daxin.articles cover WHERE cover.cover_media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM daxin.article_images remaining WHERE remaining.media_id = m.id);` : ''
  await executeSql(db, `
START TRANSACTION;
DELETE ai FROM daxin.article_images ai
JOIN daxin.articles a ON a.id = ai.article_id
WHERE a.legacy_source_table = 'dr_1_news';
${mediaCleanup}
COMMIT;`)

  const verification = await queryObjects(db, `
SELECT
  SUM(a.original_url = '') AS missing_links,
  SUM(a.content_html <> '' OR a.content_text <> '') AS remaining_bodies,
  (SELECT COUNT(*) FROM daxin.article_images ai JOIN daxin.articles x ON x.id = ai.article_id WHERE x.legacy_source_table = 'dr_1_news') AS remaining_image_links,
  (SELECT COUNT(*) FROM daxin.media_assets m JOIN daxin.article_images ai ON ai.media_id = m.id JOIN daxin.articles x ON x.id = ai.article_id WHERE x.legacy_source_table = 'dr_1_news' AND m.deleted_at IS NULL) AS remaining_active_assets
FROM daxin.articles a
WHERE a.legacy_source_table = 'dr_1_news'`)
  const result = verification[0] ?? {}
  console.log(`完成：${articleIds.length} 篇文章已回填原文链接并清空正文；删除 OSS 对象 ${assets.length} 个。`)
  console.log(`复核：缺失链接 ${result.missing_links ?? '未知'}，残留正文 ${result.remaining_bodies ?? '未知'}，图片关联 ${result.remaining_image_links ?? '未知'}，仍有效的待删媒体 ${result.remaining_active_assets ?? '未知'}。`)
}
