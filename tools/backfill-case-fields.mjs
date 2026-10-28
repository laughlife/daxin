// 回填已有案件的「品牌 / 律所 / 原告」：源站后来补了值，而增量采集遇已知案件即停，
// 本地永远拿不到。这里直接抓最近 N 页列表，只补本地为空的字段。
//
// 用法：
//   node tools/backfill-case-fields.mjs            # 默认 10 页
//   node tools/backfill-case-fields.mjs --pages 20
//   node tools/backfill-case-fields.mjs --dry-run
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(ROOT, 'web/package.json'))
const { parseWorldTroCasePage } = await import('../web/server/utils/worldtro/parser.mjs')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const PAGES = Number(option('pages', 10))
const DRY = args.includes('--dry-run')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
const mysql = require('mysql2/promise')

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const db = await mysql.createConnection({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'daxin',
  charset: 'utf8mb4',
})

let url = 'https://worldtro.com/tro'
let page = 0
let scanned = 0
let brandFilled = 0
let firmFilled = 0
let plaintiffFilled = 0
const seen = new Set()

while (url && page < PAGES) {
  const html = await fetchPage(url)
  if (html.includes('安全验证')) { console.warn('触发验证页，停止'); break }
  const parsed = parseWorldTroCasePage(html, url)
  page += 1
  for (const item of parsed.cases) {
    const key = String(item.caseNumber || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    scanned += 1
    const brand = String(item.brand || '').trim()
    const firm = String(item.lawFirm || '').trim()
    const plaintiff = String(item.plaintiff || '').trim()
    if (!brand && !firm && !plaintiff) continue

    if (DRY) {
      const [rows] = await db.execute(
        'SELECT brand_name, law_firm_name, plaintiff FROM cases WHERE case_number = ? LIMIT 1',
        [key],
      )
      const row = rows[0]
      if (!row) continue
      if (!row.brand_name && brand) brandFilled += 1
      if (!row.law_firm_name && firm) firmFilled += 1
      if (!row.plaintiff && plaintiff) plaintiffFilled += 1
      continue
    }

    const [before] = await db.execute(
      'SELECT brand_name, law_firm_name, plaintiff FROM cases WHERE case_number = ? LIMIT 1',
      [key],
    )
    const old = before[0] || {}
    if (!old.brand_name && brand) brandFilled += 1
    if (!old.law_firm_name && firm) firmFilled += 1
    if (!old.plaintiff && plaintiff) plaintiffFilled += 1

    await db.execute(
      `UPDATE cases SET
         brand_name = IF(brand_name = '', ?, brand_name),
         law_firm_name = IF(law_firm_name = '', ?, law_firm_name),
         plaintiff = IF(plaintiff = '', ?, plaintiff),
         updated_at = NOW()
       WHERE case_number = ?`,
      [brand, firm, plaintiff, key],
    )
  }
  url = parsed.nextPageUrl
  await new Promise((r) => setTimeout(r, 1500))
}

console.log(`扫描 ${page} 页 / ${scanned} 条案件`)
console.log(`补品牌 ${brandFilled}、补律所 ${firmFilled}、补原告 ${plaintiffFilled}${DRY ? '（dry-run，未写库）' : ''}`)
await db.end()
