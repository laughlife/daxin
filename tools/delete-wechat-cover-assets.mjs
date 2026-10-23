// 删除公众号文章旧的「专辑方图」封面（150x150）及其 OSS 对象与 media_assets 记录。
//
// 背景：公众号专辑接口只给 150x150 方图，文章页有 900x382 长图。
// 本次改版把封面换成文章页长图（见 tools/backfill-wechat-covers.mjs），
// 旧方图的对象与记录必须先清掉，避免 OSS 上留下 799 个无人引用的图片。
//
// 删除范围（严格限定，防止误伤 site_logo / about_* 等其它媒体）：
//   articles.legacy_source_table = 'wechat_album'
//   AND articles.cover_media_id IS NOT NULL
//   AND media_assets.legacy_source_table = 'wechat_album_image'
//   AND media_assets.usage_scope = 'article'
// 任何一条不满足即整批中止（不做部分删除），确保不会碰到别的媒体。
//
// 用法：
//   node tools/delete-wechat-cover-assets.mjs --dry-run   # 只统计，不删除
//   node tools/delete-wechat-cover-assets.mjs             # 真正删除
// 可选：--concurrency 6
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  REPO_ROOT,
  executeSql,
  queryObjects,
  queryRows,
  resolveTargetConnection,
} from './migrate-legacy/mysql-client.mjs'
import { deleteObject, isOssConfigComplete, readOssConfig } from './migrate-legacy/oss-client.mjs'

function parseArgs(argv) {
  const options = { dryRun: false, concurrency: 6 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--concurrency') options.concurrency = Math.max(1, Number(argv[++index] ?? 6))
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** 把数组切成若干段，用于 WHERE id IN (...) 的批量语句。 */
function chunk(list, size = 500) {
  const result = []
  for (let index = 0; index < list.length; index += size) result.push(list.slice(index, index + size))
  return result
}

async function runPool(items, concurrency, worker) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const target = resolveTargetConnection()
  if (!target) throw new Error('无法解析目标库连接（检查 web/.env 的 DB_*）')
  const config = readOssConfig()
  if (!isOssConfigComplete(config)) throw new Error('OSS 配置不完整')

  // 1. 取出作用域内的媒体；按媒体聚合，确认每张图只被公众号文章引用。
  const rows = await queryObjects(target, `
SELECT m.id AS media_id, m.object_key, m.legacy_source_table, m.usage_scope,
       COUNT(a.id) AS article_count
FROM articles a
JOIN media_assets m ON m.id = a.cover_media_id
WHERE a.legacy_source_table = 'wechat_album' AND a.cover_media_id IS NOT NULL
GROUP BY m.id, m.object_key, m.legacy_source_table, m.usage_scope
ORDER BY m.id`)
  const media = rows.map((row) => ({
    id: Number(row.media_id),
    objectKey: String(row.object_key),
    legacySourceTable: String(row.legacy_source_table),
    usageScope: String(row.usage_scope),
    articleCount: Number(row.article_count),
  }))

  const articleRows = await queryRows(target, `
SELECT COUNT(*) FROM articles WHERE legacy_source_table = 'wechat_album' AND cover_media_id IS NOT NULL`)
  const articleCount = Number(articleRows[0]?.[0] ?? 0)

  // 2. 作用域断言：任何越界即中止，绝不“尽量删”。
  const foreign = media.filter((item) => item.legacySourceTable !== 'wechat_album_image' || item.usageScope !== 'article')
  if (foreign.length > 0) {
    throw new Error(`作用域校验失败：${foreign.length} 条媒体不属于 wechat_album_image/article，已中止。示例 id=${foreign[0].id} table=${foreign[0].legacySourceTable} scope=${foreign[0].usageScope}`)
  }
  const ids = media.map((item) => item.id)
  if (ids.length > 0) {
    const sharedRows = await queryRows(target, `
SELECT COUNT(*) FROM articles
WHERE cover_media_id IN (${ids.join(',')}) AND legacy_source_table <> 'wechat_album'`)
    const shared = Number(sharedRows[0]?.[0] ?? 0)
    if (shared > 0) throw new Error(`作用域校验失败：${shared} 篇非公众号文章也引用这些封面，已中止`)
  }

  const objectKeys = [...new Set(media.map((item) => item.objectKey))]
  console.log(`待删除 OSS 对象：${objectKeys.length} 个（media_assets 记录 ${media.length} 条，articles 封面关联 ${articleCount} 条）`)
  console.log('示例 object_key：')
  for (const key of objectKeys.slice(0, 3)) console.log(`  ${key}`)

  if (options.dryRun) {
    console.log('[dry-run] 未执行删除')
    return
  }

  // 3. 逐对象删除 OSS；4xx/5xx 记失败，不阻断其它对象。
  const results = new Map()
  let done = 0
  await runPool(objectKeys, options.concurrency, async (objectKey) => {
    try {
      const response = await deleteObject(config, objectKey)
      const ok = response.status === 204 || response.status === 200 || response.status === 404
      results.set(objectKey, { ok, status: response.status })
      if (!ok) {
        const text = await response.text().catch(() => '')
        results.get(objectKey).detail = text.slice(0, 160)
      }
    } catch (error) {
      results.set(objectKey, { ok: false, status: 0, detail: error.message })
    }
    done += 1
    if (done % 50 === 0 || done === objectKeys.length) console.log(`  OSS 删除进度 ${done}/${objectKeys.length}`)
  })

  const failed = [...results.entries()].filter(([, value]) => !value.ok)
  const succeededIds = media.filter((item) => results.get(item.objectKey)?.ok).map((item) => item.id)
  const succeededKeys = objectKeys.filter((key) => results.get(key)?.ok)

  // 4. 只对 OSS 删除成功的媒体做软删除，并解除这些文章的外键引用。
  let mediaSoftDeleted = 0
  for (const part of chunk(succeededIds)) {
    const before = await queryRows(target, `SELECT COUNT(*) FROM media_assets WHERE id IN (${part.join(',')}) AND deleted_at IS NULL`)
    await executeSql(target, `UPDATE media_assets SET deleted_at = NOW(), updated_at = NOW() WHERE id IN (${part.join(',')}) AND deleted_at IS NULL`)
    mediaSoftDeleted += Number(before[0]?.[0] ?? 0)
  }
  let articlesNulled = 0
  for (const part of chunk(succeededIds)) {
    const before = await queryRows(target, `
SELECT COUNT(*) FROM articles
WHERE legacy_source_table = 'wechat_album' AND cover_media_id IN (${part.join(',')})`)
    await executeSql(target, `
UPDATE articles SET cover_media_id = NULL
WHERE legacy_source_table = 'wechat_album' AND cover_media_id IN (${part.join(',')})`)
    articlesNulled += Number(before[0]?.[0] ?? 0)
  }

  // 5. 落一份审计清单，便于核对与回滚（回滚依据 backup/wechat-covers-before-backfill-*.csv）。
  const report = {
    startedAt: new Date().toISOString(),
    scope: "articles.legacy_source_table='wechat_album'",
    objectKeys: objectKeys.length,
    mediaRows: media.length,
    articleLinks: articleCount,
    ossDeleted: succeededKeys.length,
    ossFailed: failed.length,
    mediaSoftDeleted,
    articlesNulled,
    failures: failed.map(([objectKey, value]) => ({ objectKey, ...value })),
  }
  const reportPath = join(REPO_ROOT, 'backup', `wechat-cover-deletion-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('')
  console.log(`OSS 删除成功：${succeededKeys.length}/${objectKeys.length}，失败：${failed.length}`)
  console.log(`media_assets 软删除：${mediaSoftDeleted} 条`)
  console.log(`articles.cover_media_id 置 NULL：${articlesNulled} 条`)
  console.log(`审计清单：${reportPath}`)
  if (failed.length > 0) {
    console.log('失败对象（前 5 条）：')
    for (const [objectKey, value] of failed.slice(0, 5)) console.log(`  ${objectKey} → HTTP ${value.status} ${value.detail ?? ''}`)
    process.exitCode = 1
  }

  const remaining = await queryRows(target, `
SELECT COUNT(*) FROM articles WHERE legacy_source_table = 'wechat_album' AND cover_media_id IS NOT NULL`)
  console.log(`剩余未清空的公众号封面关联：${remaining[0]?.[0] ?? '?'}`)
}

main().catch((error) => {
  console.error(`删除失败：${error.message}`)
  process.exitCode = 1
})
