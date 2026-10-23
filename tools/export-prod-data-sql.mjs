// 生成生产环境可执行的数据 SQL（不依赖本机自增 ID）。
//
// 背景：本机已跑完全量回填（799 篇换了长图封面 + 字号），生产不跑全量，
// 因此需要把「新增的媒体记录」和「文章封面/字号」导出成可移植的 SQL：
//   - media_assets 用 object_key（唯一）作为业务键，生产插入后自增 ID 可能不同
//   - articles 用 slug 关联，cover_media_id 通过 object_key 反查
//   - wechat_album_items 用 source_url 关联
//
// 用法：node tools/export-prod-data-sql.mjs <输出目录>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const outDir = process.argv[2] ?? 'release/prod-sql'
mkdirSync(outDir, { recursive: true })

function query(sql) {
  const out = execFileSync(MYSQL, [
    '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
    '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
    '--execute', `USE daxin; ${sql}`,
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return out.split('\n').filter(Boolean).map((line) => line.split('\t'))
}

function q(value) {
  if (value === 'NULL' || value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// ---------- 1) 本次新增的封面媒体（公众号文章封面） ----------
const media = query(`
  SELECT m.object_key, m.public_url, m.file_name, m.mime_type, m.byte_size,
         m.width, m.height, m.usage_scope, m.title, m.created_at
  FROM media_assets m
  JOIN articles a ON a.cover_media_id = m.id
  WHERE a.legacy_source_table = 'wechat_album' AND m.deleted_at IS NULL
  ORDER BY m.id`)

const lines = []
lines.push('-- 01_media_assets.sql')
lines.push('-- 公众号文章封面（长图）媒体记录。')
lines.push('-- object_key 是唯一键：重复执行不会产生重复媒体，生产自增 ID 与本机不同也不影响。')
lines.push('-- 依赖：storage 上已存在对应对象（本机回填时已上传 OSS，生产使用的是同一个 bucket）。')
lines.push('SET NAMES utf8mb4;')
lines.push('')
lines.push('INSERT INTO media_assets')
lines.push('  (object_key, public_url, file_name, mime_type, byte_size, width, height, usage_scope, title, created_at, updated_at)')
lines.push('VALUES')
const values = media.map(([objectKey, publicUrl, fileName, mime, size, width, height, scope, title, createdAt]) => (
  `  (${q(objectKey)}, ${q(publicUrl)}, ${q(fileName)}, ${q(mime)}, ${Number(size) || 0}, ` +
  `${width === 'NULL' ? 'NULL' : Number(width)}, ${height === 'NULL' ? 'NULL' : Number(height)}, ` +
  `${q(scope)}, ${q(title)}, ${q(createdAt)}, ${q(createdAt)})`
))
lines.push(values.join(',\n') + ';')
writeFileSync(join(outDir, '01_media_assets.sql'), lines.join('\n') + '\n', 'utf8')
console.log(`01_media_assets.sql: ${media.length} 条媒体`)

// ---------- 2) 文章封面 + 标题字号 ----------
const articles = query(`
  SELECT a.slug, m.object_key, IFNULL(a.title_font_size, 'NULL')
  FROM articles a
  LEFT JOIN media_assets m ON m.id = a.cover_media_id
  WHERE a.legacy_source_table = 'wechat_album'
  ORDER BY a.id`)

const art = []
art.push('-- 02_articles_cover_font.sql')
art.push('-- 按 slug 更新公众号文章的封面与标题字号。')
art.push('-- cover_media_id 通过 object_key 反查，避免依赖本机自增 ID。')
art.push('SET NAMES utf8mb4;')
art.push('')
for (const [slug, objectKey, fontSize] of articles) {
  if (!objectKey || objectKey === 'NULL') continue
  art.push(
    `UPDATE articles SET cover_media_id = (SELECT id FROM media_assets WHERE object_key = ${q(objectKey)}), ` +
    `title_font_size = ${fontSize === 'NULL' ? 'NULL' : Number(fontSize)}, updated_at = NOW() ` +
    `WHERE slug = ${q(slug)};`,
  )
}
writeFileSync(join(outDir, '02_articles_cover_font.sql'), art.join('\n') + '\n', 'utf8')
console.log(`02_articles_cover_font.sql: ${art.filter((l) => l.startsWith('UPDATE')).length} 条文章更新`)

// ---------- 3) 专辑条目字号 ----------
const items = query(`
  SELECT i.source_url, IFNULL(i.title_font_size, 'NULL')
  FROM wechat_album_items i
  WHERE i.title_font_size IS NOT NULL
  ORDER BY i.id`)

const it = []
it.push('-- 03_album_items_font.sql')
it.push('-- 按 source_url 更新专辑条目的标题字号（同一篇文章可能出现在多个专辑，故按 URL 匹配）。')
it.push('SET NAMES utf8mb4;')
it.push('')
for (const [url, fontSize] of items) {
  if (!url || url === 'NULL') continue
  it.push(`UPDATE wechat_album_items SET title_font_size = ${Number(fontSize)} WHERE source_url = ${q(url)};`)
}
writeFileSync(join(outDir, '03_album_items_font.sql'), it.join('\n') + '\n', 'utf8')
console.log(`03_album_items_font.sql: ${items.length} 条条目更新`)

// ---------- 4) 采集游标现状 ----------
const sources = query(`
  SELECT source_key, IFNULL(cursor_message_id, ''), IFNULL(cursor_item_index, ''),
         IFNULL(initial_synced_at, ''), IFNULL(deployment_full_synced_at, ''), IFNULL(last_synced_at, '')
  FROM wechat_album_sources ORDER BY id`)

const cur = []
cur.push('-- 04_cursor_snapshot.sql')
cur.push('-- 采集游标现状（本次回填**未推进**游标：回填只更新封面与字号，不抓专辑列表）。')
cur.push('-- 若生产不希望立刻全量采集，可按下面这些值对齐，避免重复抓取。')
cur.push('SET NAMES utf8mb4;')
cur.push('')
for (const [key, msgId, itemIndex, initial, deployment, last] of sources) {
  cur.push(
    `UPDATE wechat_album_sources SET cursor_message_id = ${q(msgId)}, cursor_item_index = ${q(itemIndex)}, ` +
    `initial_synced_at = ${initial ? q(initial) : 'NULL'}, ` +
    `deployment_full_synced_at = ${deployment ? q(deployment) : 'NULL'}, ` +
    `last_synced_at = ${last ? q(last) : 'NULL'} WHERE source_key = ${q(key)};`,
  )
}
writeFileSync(join(outDir, '04_cursor_snapshot.sql'), cur.join('\n') + '\n', 'utf8')
console.log(`04_cursor_snapshot.sql: ${sources.length} 个采集源`)

console.log('\n输出目录：' + outDir)
