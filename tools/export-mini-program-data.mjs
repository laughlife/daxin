// 导出「数据」而非结构：品牌 / 律所 / 图片 / 详情 + 公众号采集游标。
// 用于生产已执行过迁移、只想灌数据的情况（避免重新采集）。
//
// 用法：node tools/export-mini-program-data.mjs
// 输出：release/prod-sql/61_mini_program_data.sql
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(ROOT, 'web/package.json'))
const mysql = require('mysql2/promise')

function loadEnv() {
  const env = { ...process.env }
  for (const file of ['web/.env.local', 'web/.env', '.env.local']) {
    const path = resolve(ROOT, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  return env
}

const env = loadEnv()
const db = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'daxin',
  charset: 'utf8mb4',
})

const esc = (value) => {
  if (value === null || value === undefined) return 'NULL'
  if (Buffer.isBuffer(value)) return mysql.escape(value.toString('utf8'))
  // JSON 列会被驱动解析成对象/数组，必须先序列化成字符串
  if (typeof value === 'object' && !(value instanceof Date)) return mysql.escape(JSON.stringify(value))
  return mysql.escape(value)
}
const out = []
const line = (text = '') => out.push(text)

line('-- ============================================================')
line('-- 小程序品牌/律所数据（不含结构，结构迁移 047~053 已执行）')
line('-- 生成时间：' + new Date().toISOString())
line('-- 内容：brands / law_firms / entity_images / entity_details + 公众号采集游标')
line('-- ============================================================')
line()
line('SET NAMES utf8mb4;')
line('SET FOREIGN_KEY_CHECKS = 0;')
line()

// ---------- brands ----------
const [brands] = await db.query(
  `SELECT id, mp_id, name, slug, summary, ip_category, lawsuit_type, brand_owner, default_law_firm,
          cover_url, source, is_published, status, source_hash, detail_synced_at
   FROM brands WHERE mp_id IS NOT NULL ORDER BY id`,
)
line('-- ---------- brands：' + brands.length + ' 条 ----------')
for (const r of brands) {
  line(
    `INSERT INTO brands (id, mp_id, name, slug, summary, ip_category, lawsuit_type, brand_owner,
  default_law_firm, cover_url, source, is_published, status, source_hash, detail_synced_at)
 VALUES (${r.id}, ${esc(r.mp_id)}, ${esc(r.name)}, ${esc(r.slug)}, ${esc(r.summary)}, ${esc(r.ip_category)},
  ${esc(r.lawsuit_type)}, ${esc(r.brand_owner)}, ${esc(r.default_law_firm)}, ${esc(r.cover_url)},
  ${esc(r.source)}, ${r.is_published}, ${r.status}, ${esc(r.source_hash)}, ${esc(r.detail_synced_at)})
 ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), summary = VALUES(summary),
  ip_category = VALUES(ip_category), lawsuit_type = VALUES(lawsuit_type),
  brand_owner = VALUES(brand_owner), default_law_firm = VALUES(default_law_firm),
  cover_url = VALUES(cover_url), is_published = VALUES(is_published), status = VALUES(status),
  source_hash = VALUES(source_hash), detail_synced_at = VALUES(detail_synced_at);`,
  )
}
line()

// ---------- law_firms ----------
const [firms] = await db.query(
  `SELECT id, mp_id, name, slug, summary, short_name, address, website, logo_url, source,
          is_published, status, source_hash, detail_synced_at
   FROM law_firms WHERE mp_id IS NOT NULL ORDER BY id`,
)
line('-- ---------- law_firms：' + firms.length + ' 条 ----------')
for (const r of firms) {
  line(
    `INSERT INTO law_firms (id, mp_id, name, slug, summary, short_name, address, website, logo_url,
  source, is_published, status, source_hash, detail_synced_at)
 VALUES (${r.id}, ${esc(r.mp_id)}, ${esc(r.name)}, ${esc(r.slug)}, ${esc(r.summary)}, ${esc(r.short_name)},
  ${esc(r.address)}, ${esc(r.website)}, ${esc(r.logo_url)}, ${esc(r.source)}, ${r.is_published},
  ${r.status}, ${esc(r.source_hash)}, ${esc(r.detail_synced_at)})
 ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), short_name = VALUES(short_name),
  address = VALUES(address), website = VALUES(website), logo_url = VALUES(logo_url),
  is_published = VALUES(is_published), status = VALUES(status),
  source_hash = VALUES(source_hash), detail_synced_at = VALUES(detail_synced_at);`,
  )
}
line()

// ---------- entity_images ----------
const [images] = await db.query(
  `SELECT entity_type, entity_id, image_url, sort_order FROM entity_images ORDER BY entity_type, entity_id, sort_order`,
)
line('-- ---------- entity_images：' + images.length + ' 条（先清空再插入，避免残留）----------')
line('DELETE FROM entity_images;')
for (let i = 0; i < images.length; i += 200) {
  const chunk = images.slice(i, i + 200)
  const values = chunk
    .map((r) => `(${esc(r.entity_type)}, ${r.entity_id}, ${esc(r.image_url)}, ${r.sort_order})`)
    .join(',\n')
  line(`INSERT INTO entity_images (entity_type, entity_id, image_url, sort_order) VALUES\n${values};`)
}
line()

// ---------- entity_details ----------
const [details] = await db.query(
  `SELECT entity_type, entity_id, intro, raw_json FROM entity_details ORDER BY entity_type, entity_id`,
)
line('-- ---------- entity_details：' + details.length + ' 条 ----------')
for (const r of details) {
  line(
    `INSERT INTO entity_details (entity_type, entity_id, intro, raw_json)
 VALUES (${esc(r.entity_type)}, ${r.entity_id}, ${esc(r.intro)}, ${esc(r.raw_json)})
 ON DUPLICATE KEY UPDATE intro = VALUES(intro), raw_json = VALUES(raw_json);`,
  )
}
line()

// ---------- 公众号采集游标 ----------
const [cursors] = await db.query(
  `SELECT source_key, cursor_message_id, cursor_item_index, initial_synced_at,
          deployment_full_synced_at, last_synced_at
   FROM wechat_album_sources ORDER BY id`,
)
line('-- ---------- 公众号专辑游标：' + cursors.length + ' 个源（只更新已存在的行）----------')
for (const r of cursors) {
  line(
    `UPDATE wechat_album_sources SET cursor_message_id = ${esc(r.cursor_message_id)},
  cursor_item_index = ${Number(r.cursor_item_index) || 0},
  initial_synced_at = ${esc(r.initial_synced_at)},
  deployment_full_synced_at = ${esc(r.deployment_full_synced_at)},
  last_synced_at = ${esc(r.last_synced_at)}
 WHERE source_key = ${esc(r.source_key)};`,
  )
}
line()

// ---------- 案件详情游标/状态 ----------
const [[caseDetailStat]] = await db.query(
  `SELECT COUNT(*) AS total,
          SUM(fetch_status = 'ok') AS ok_count,
          SUM(fetch_status = 'pending') AS pending_count
   FROM case_details`,
)
line('-- ---------- 案件详情状态（仅统计，不导出数据）----------')
line(`-- 本地：共 ${caseDetailStat.total}，ok ${caseDetailStat.ok_count}，pending ${caseDetailStat.pending_count}`)
line()

line('SET FOREIGN_KEY_CHECKS = 1;')
line()
line('-- 校对：')
line("SELECT COUNT(*) AS 品牌 FROM brands WHERE mp_id IS NOT NULL;")
line("SELECT COUNT(*) AS 律所 FROM law_firms WHERE mp_id IS NOT NULL;")
line('SELECT COUNT(*) AS 图片 FROM entity_images;')
line('SELECT COUNT(*) AS 详情 FROM entity_details;')

mkdirSync(resolve(ROOT, 'release/prod-sql'), { recursive: true })
const target = resolve(ROOT, 'release/prod-sql/61_mini_program_data.sql')
writeFileSync(target, out.join('\n'), 'utf8')
console.log(`已导出：${target}`)
console.log(`品牌 ${brands.length}、律所 ${firms.length}、图片 ${images.length}、详情 ${details.length}、游标源 ${cursors.length}`)
await db.end()
