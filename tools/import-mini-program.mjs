// 从小程序后台（wx.daxinfawu.com:8443）采集品牌与律所，写入 brands / law_firms
// + entity_images / entity_details / entity_case_rows（品牌「起诉信息」）。
//
// 认证：优先用 WX_ADMIN_USER / WX_ADMIN_PASSWORD 自动登录（服务端不校验验证码），
// 也可用 WX_ADMIN_COOKIE 直接带会话（本地调试用）。
//
// 用法：
//   node tools/import-mini-program.mjs --limit 3 --dry-run
//   node tools/import-mini-program.mjs --only brands
//   node tools/import-mini-program.mjs --only brands --brand 1029   # 只同步一个品牌（强制重抓详情）
//   node tools/import-mini-program.mjs --only brands --force --limit 200   # 强制重抓详情（补历史发案）
//   WX_DETAIL_SLICE=0 node tools/import-mini-program.mjs   # 补全量后：只在列表字段变化时抓详情（更快）
//   node tools/import-mini-program.mjs                 # 全量
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(ROOT, 'web/package.json'))
const mysql = require('mysql2/promise')

// ---------- 配置 ----------
function loadEnv() {
  const file = resolve(ROOT, '.env.local')
  const env = { ...process.env }
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  for (const extra of ['web/.env.local', '.env.local']) {
    const path = resolve(ROOT, extra)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  const appEnv = resolve(ROOT, 'web/.env')
  if (existsSync(appEnv)) {
    for (const line of readFileSync(appEnv, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  return env
}

const env = loadEnv()
const BASE = (env.WX_ADMIN_URL || 'https://wx.daxinfawu.com:8443').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
const DELAY_MS = Number(env.WX_ADMIN_DELAY_MS || 1000)

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const LIMIT = Number(option('limit', 0))
const DRY_RUN = args.includes('--dry-run')
const ONLY = option('only', '') // brands | lawfirms
// 只同步一个小程序品牌（mp_id），便于单条补抓/验证；指定后强制重抓详情
const ONLY_BRAND = option('brand', '')
// 强制重抓所有详情（首次补「起诉信息」/图片时用，耗时长，建议配合 --limit 分批）
const FORCE_DETAIL = args.includes('--force')
// 滚动刷新：每班次额外抓 1/N 详情（默认 4 → 4 个班次覆盖全部）。
// 设为 0 表示只在列表字段变化时抓详情：补过一次全量之后，日常跑会明显更快。
const rawSlice = Number(env.WX_DETAIL_SLICE ?? 4)
const DETAIL_SLICE = Number.isFinite(rawSlice) ? Math.max(0, Math.floor(rawSlice)) : 4
// 当前班次序号（0..N-1），用于挑选本班次要刷新的切片
const SLICE_INDEX = DETAIL_SLICE > 0
  ? Math.abs(Number(option('slice', new Date().getHours() < 12 ? 0 : 1))) % DETAIL_SLICE
  : 0

function listHash(item, kind) {
  const parts = kind === 'brand'
    ? [item.mc, item.ppf, item.dlls, item.flmc, item.qslx, item.zs, item.status]
    : [item.name, item.jc, item.dz, item.ls_url, item.url, item.zs, item.status]
  return createHash('md5').update(parts.map((v) => String(v ?? '')).join('|')).digest('hex')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')

// ---------- HTTP ----------
let cookies = env.WX_ADMIN_COOKIE || ''

function cookieHeader() {
  return cookies
}

async function request(path, { method = 'GET', form, json = false } = {}) {
  const headers = {
    'user-agent': UA,
    accept: json ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml',
    'accept-language': 'zh-CN,zh;q=0.9',
    'x-requested-with': 'XMLHttpRequest',
    referer: `${BASE}/home.jsp`,
  }
  if (cookies) headers.cookie = cookieHeader()
  let body
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    body = new URLSearchParams(form).toString()
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body })
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const item of setCookie) {
    const pair = item.split(';')[0]
    const name = pair.split('=')[0]
    const rest = cookies.split('; ').filter((c) => c && !c.startsWith(`${name}=`))
    rest.push(pair)
    cookies = rest.join('; ')
  }
  const text = await res.text()
  return { status: res.status, text }
}

async function login() {
  if (env.WX_ADMIN_COOKIE) {
    cookies = env.WX_ADMIN_COOKIE
    return 'cookie'
  }
  const user = env.WX_ADMIN_USER
  const pass = env.WX_ADMIN_PASSWORD
  if (!user || !pass) throw new Error('缺少 WX_ADMIN_USER / WX_ADMIN_PASSWORD（或 WX_ADMIN_COOKIE）')
  await request('/home.jsp')
  const res = await request('/login/adminLogin', {
    method: 'POST',
    form: { username: user, password: md5(pass) },
    json: true,
  })
  let parsed
  try { parsed = JSON.parse(res.text) } catch { throw new Error('登录返回非 JSON：' + res.text.slice(0, 120)) }
  if (parsed.status !== 'success' && parsed.code !== 0) {
    throw new Error('登录失败：' + (parsed.message || parsed.msg || res.text.slice(0, 120)))
  }
  return 'login'
}

// ---------- 解析 ----------
function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** 从详情页 HTML 取「字段 → 值」，输入框取 value，文本域取内容 */
function parseForm(html) {
  const values = {}
  for (const m of html.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)) {
    const name = m[1]
    const value = /value="([^"]*)"/.exec(m[0])
    values[name] = decodeEntities(value ? value[1] : '')
  }
  for (const m of html.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    values[m[1]] = decodeEntities(m[2]).trim()
  }
  return values
}

/** 详情页里的图片地址（去掉防缓存参数） */
function parseImages(html) {  const urls = []
  for (const m of html.matchAll(/(?:src|value)="([^"]*\/images\/[^"?]+)(?:\?[^"]*)?"/g)) {
    const path = m[1].trim()
    if (!path || path.includes('noMark')) continue
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    if (!urls.includes(url)) urls.push(url)
  }
  return urls
}

/** 富文本里引用的图片也补进图片列表 */
function parseRichTextImages(html) {
  const urls = []
  for (const m of html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)) {
    const src = m[1]
    if (!src.includes('/images/')) continue
    const url = src.startsWith('http') ? src : `${BASE}${src.split('?')[0]}`
    if (!urls.includes(url)) urls.push(url)
  }
  return urls
}

/** 单元格纯文本：去标签、解实体、压空白 */
function cellText(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * 品牌详情页的「起诉信息」表格（#qsTable）：
 * 每行依次是 起诉时间 / 案件号 / 代理律所 / 受理法院 / 起诉ID / 删除按钮。
 * 一行可能带多个案件号（顿号分隔），原样保留。
 */
function parseCaseRows(html) {
  const start = html.indexOf('id="qsTable"')
  if (start < 0) return []
  const table = html.slice(start, html.indexOf('</table>', start))
  const rows = []
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]))
    if (cells.length < 4) continue
    const [filedAt, caseNumber, lawFirm, court] = cells
    // 表头是 th，不会进 <td>；这里再用日期格式兜底
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filedAt)) continue
    if (!caseNumber) continue
    rows.push({ filedAt, caseNumber, lawFirm: lawFirm || '', court: court || '' })
  }
  return rows
}


// ---------- 采集 ----------
async function fetchPage(path, key) {
  const res = await request(path, { json: true })
  let data
  try { data = JSON.parse(res.text) } catch { throw new Error(`${key} 返回非 JSON：${res.text.slice(0, 100)}`) }
  if (data.code !== 0) throw new Error(`${key} 返回错误：${data.msg}`)
  return data
}

async function collectList(kind) {
  const isBrand = kind === 'brand'
  const path = isBrand
    ? (page) => `/ppxx/queryPpxx?page=${page}&limit=100&ppfl=&key=&status=1&zs=1`
    : (page) => `/lsxx/queryLsxx?random=${Math.random()}&page=${page}&limit=100&key=&status=1&zs=1`
  const items = []
  for (let page = 1; page <= 200; page += 1) {
    const data = await fetchPage(path(page), kind)
    const list = Array.isArray(data.data) ? data.data : []
    items.push(...list)
    if (LIMIT && items.length >= LIMIT) { items.length = LIMIT; break }
    if (list.length < 100 || items.length >= Number(data.count || 0)) break
    await sleep(DELAY_MS)
  }
  return items
}

async function collectDetail(kind, id) {
  const path = kind === 'brand' ? `/ppxx/openPpxxById?id=${id}&status=1` : `/lsxx/openLsxxById?id=${id}&status=1`
  const res = await request(path)
  const fields = parseForm(res.text)
  const images = [...parseImages(res.text), ...parseRichTextImages(res.text)]
  return { fields, images: [...new Set(images)], caseRows: parseCaseRows(res.text) }
}

// ---------- 入库 ----------
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
const jsonOrNull = (v) => (v ? q(JSON.stringify(v)) : 'NULL')

async function connectDb() {
  return mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'daxin',
    charset: 'utf8mb4',
  })
}

async function saveBrand(db, item, detail, hash) {
  if (!item || item.id === undefined) throw new Error('列表项缺少 id')
  const [rows] = await db.execute(
    `INSERT INTO brands (mp_id, name, slug, summary, ip_category, lawsuit_type, brand_owner,
       default_law_firm, cover_url, source, is_published, source_hash, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'import', 1, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = VALUES(name), ip_category = VALUES(ip_category),
       lawsuit_type = VALUES(lawsuit_type), brand_owner = VALUES(brand_owner),
       default_law_firm = VALUES(default_law_firm),
       cover_url = IF(? OR cover_url = '', VALUES(cover_url), cover_url),
       is_published = 1, source_hash = VALUES(source_hash),
       detail_synced_at = IF(?, NOW(), detail_synced_at), updated_at = NOW()`,
    [
      item.id, item.mc || '', `brand-${item.id}`,
      item.flmc || '', item.qslx || '', item.ppf || '', item.dlls || '',
      detail ? detail.images[0] || '' : '', hash,
      detail ? 1 : 0, detail ? 1 : 0,
    ],
  )
  const [[{ id: brandId }]] = await db.execute('SELECT id FROM brands WHERE mp_id = ?', [item.id])
  if (!detail) return brandId
  await saveImages(db, 'brand', brandId, detail.images)
  await saveCaseRows(db, 'brand', brandId, detail.caseRows || [])
  await db.execute(
    `INSERT INTO entity_details (entity_type, entity_id, intro, raw_json, updated_at)
     VALUES ('brand', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE intro = VALUES(intro), raw_json = VALUES(raw_json), updated_at = NOW()`,
    [brandId, item.js || '', JSON.stringify(item)],
  )
  return brandId
}

async function saveLawFirm(db, item, detail, hash) {
  if (!item || item.id === undefined) throw new Error('列表项缺少 id')
  const name = item.name || ''
  await db.execute(
    `INSERT INTO law_firms (mp_id, name, slug, summary, short_name, address, website, logo_url,
       source, is_published, source_hash, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, 'import', 1, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = VALUES(name), short_name = VALUES(short_name),
       address = VALUES(address), website = VALUES(website),
       logo_url = IF(? OR logo_url = '', VALUES(logo_url), logo_url),
       is_published = 1, source_hash = VALUES(source_hash),
       detail_synced_at = IF(?, NOW(), detail_synced_at), updated_at = NOW()`,
    [
      item.id, name, `firm-${item.id}`, item.jc || '', (item.dz || '').trim(),
      (item.ls_url || item.url || '').trim(), detail ? detail.images[0] || '' : '', hash,
      detail ? 1 : 0, detail ? 1 : 0,
    ],
  )
  const [[{ id: firmId }]] = await db.execute('SELECT id FROM law_firms WHERE mp_id = ?', [item.id])
  if (!detail) return firmId
  await saveImages(db, 'law_firm', firmId, detail.images)
  await db.execute(
    `INSERT INTO entity_details (entity_type, entity_id, intro, raw_json, updated_at)
     VALUES ('law_firm', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE intro = VALUES(intro), raw_json = VALUES(raw_json), updated_at = NOW()`,
    [firmId, item.other || '', JSON.stringify(item)],
  )
  return firmId
}

/**
 * 是否需要抓详情：
 *   - 库里没有这条 → 需要
 *   - 列表指纹变了 → 需要
 *   - 命中本班次滚动切片 → 需要（覆盖图片/富文本的静默改动）
 */
async function shouldFetchDetail(db, kind, mpId, hash) {
  if (!db) return true
  const table = kind === 'brand' ? 'brands' : 'law_firms'
  const [rows] = await db.execute(
    `SELECT source_hash, mp_id FROM ${table} WHERE mp_id = ? LIMIT 1`,
    [mpId],
  )
  const row = rows[0]
  if (!row) return true
  if ((row.source_hash || '') !== hash) return true
  // WX_DETAIL_SLICE=0：关闭滚动刷新，列表字段没变就不再抓详情
  if (DETAIL_SLICE === 0) return false
  const [remainder] = await db.execute('SELECT ? % ? AS r', [Number(mpId), DETAIL_SLICE])
  return Number(remainder[0].r) === SLICE_INDEX
}

async function saveImages(db, type, entityId, urls) {
  await db.execute('DELETE FROM entity_images WHERE entity_type = ? AND entity_id = ?', [type, entityId])
  for (let i = 0; i < urls.length; i += 1) {
    await db.execute(
      `INSERT IGNORE INTO entity_images (entity_type, entity_id, image_url, sort_order)
       VALUES (?, ?, ?, ?)`,
      [type, entityId, urls[i], i],
    )
  }
}

/**
 * 品牌历史发案（小程序「起诉信息」表格）：整块先删后插，保持与后台一致。
 * 不合并 cases 表：这里存的是小程序维护的行，前台按原样展示。
 */
async function saveCaseRows(db, type, entityId, rows) {
  await db.execute('DELETE FROM entity_case_rows WHERE entity_type = ? AND entity_id = ?', [type, entityId])
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    await db.execute(
      `INSERT INTO entity_case_rows (entity_type, entity_id, filed_at, case_number, law_firm, court, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [type, entityId, row.filedAt || null, row.caseNumber || '', row.lawFirm || '', row.court || '', i],
    )
  }
}

function slugOf(text) {
  const base = String(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `${base || 'entity'}-${createHash('md5').update(String(text)).digest('hex').slice(0, 6)}`
}

// ---------- 主流程 ----------
const mode = await login()
console.log(`已认证（${mode}），开始采集${ONLY ? `（仅 ${ONLY}）` : ''}`)

const db = DRY_RUN ? null : await connectDb()

// 启动自检：起诉信息表缺失时每个品牌都会静默失败，这里直接报错并给出修复命令
if (db) {
  const [tables] = await db.query("SHOW TABLES LIKE 'entity_case_rows'")
  if (!tables.length) {
    console.error('缺少表 entity_case_rows，采集会失败。请先执行：')
    console.error('  node tools/migrate-legacy/schema-check.mjs --apply')
    await db.end()
    process.exit(1)
  }
}

let brandCount = 0
let firmCount = 0

if (!ONLY || ONLY === 'brands') {
  const list = await collectList('brand')
  console.log(`品牌列表：${list.length} 条`)
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i]
    if (ONLY_BRAND && String(item.id) !== String(ONLY_BRAND)) continue
    try {
      const hash = listHash(item, 'brand')
      // 指定单条或 --force 时强制重抓详情，便于补「起诉信息」等详情字段
      const needDetail = (ONLY_BRAND || FORCE_DETAIL) ? true : await shouldFetchDetail(db, 'brand', item.id, hash)
      const detail = needDetail ? await collectDetail('brand', item.id) : null
      if (db) await saveBrand(db, item, detail, hash)
      brandCount += 1
      if (!needDetail) { await sleep(DELAY_MS); continue }
      if (i < 3 || ONLY_BRAND) console.log(`  ✓ ${item.id} ${item.mc} 图片 ${detail.images.length} 张、起诉信息 ${detail.caseRows.length} 行`)
    } catch (error) {
      console.warn(`  ✗ 品牌 ${item.id}: ${String(error).slice(0, 80)}`)
    }
    if (i % 50 === 0 && i > 0) console.log(`  …品牌进度 ${i}/${list.length}`)
    await sleep(DELAY_MS)
  }
}

if (!ONLY || ONLY === 'lawfirms') {
  const list = await collectList('lawfirm')
  console.log(`律所列表：${list.length} 条`)
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i]
    try {
      const hash = listHash(item, 'lawfirm')
      const needDetail = FORCE_DETAIL ? true : await shouldFetchDetail(db, 'lawfirm', item.id, hash)
      const detail = needDetail ? await collectDetail('lawfirm', item.id) : null
      if (db) await saveLawFirm(db, item, detail, hash)
      firmCount += 1
      if (!needDetail) { await sleep(DELAY_MS); continue }
      if (i < 3) console.log(`  ✓ ${item.id} ${item.name} 图片 ${detail.images.length} 张`)
    } catch (error) {
      console.warn(`  ✗ 律所 ${item.id}: ${String(error).slice(0, 80)}`)
    }
    await sleep(DELAY_MS)
  }
}

if (db) await db.end()
console.log(`完成：品牌 ${brandCount} 条，律所 ${firmCount} 条${DRY_RUN ? '（dry-run，未写库）' : ''}`)
