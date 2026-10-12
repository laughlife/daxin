// 验证站点配置字段顺序：接口返回与后台页面渲染都应按 sort_order 排。
import { readFileSync } from 'node:fs'

const base = 'http://127.0.0.1:3002'
const jar = new Map()

async function call(path, options = {}) {
  const headers = {}
  if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(base + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  return { status: response.status, json, text }
}

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 期望顺序：与迁移 009 的 sort_order 一致，即前台页面从上到下。 */
const EXPECTED = {
  home: [
    'home_hero_badge', 'home_hero_title', 'home_hero_subtitle',
    'home_hero_primary_label', 'home_hero_primary_link', 'home_hero_secondary_label',
    'home_banner_image', 'home_right_image', 'home_stats',
  ],
  about: [
    'about_hero_welcome', 'about_hero_title', 'about_hero_paragraph', 'about_hero_image',
    'about_team_image', 'about_team_title', 'about_team_paragraphs', 'about_contact_title',
    'about_business_images', 'about_success_title', 'about_success_images',
    'about_lecture_title', 'about_lecture_images', 'about_partner_title',
    'about_partner_images', 'about_honors_images',
  ],
  site: [
    'site_name', 'site_logo', 'site_subtitle', 'site_description',
    'contact_phone', 'contact_email', 'contact_address', 'contact_wechat',
  ],
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })

console.log('接口返回顺序：')
for (const kind of ['home', 'about', 'site']) {
  const response = await call(`/api/admin/settings?kind=${kind}`)
  const keys = (response.json?.data?.items ?? []).map((item) => item.key)
  check(`${kind} 顺序符合预期`, JSON.stringify(keys) === JSON.stringify(EXPECTED[kind]), keys.join(' → '))
}

check('about_success_category 已不再返回',
  !(await call('/api/admin/settings?kind=about')).json?.data?.items?.some((i) => i.key === 'about_success_category'))

// 后台页面的字段渲染顺序（按 label 里出现 setting-<kind>-<key> 的先后）
console.log('\n后台页面渲染顺序：')
const page = await call('/admin/settings')
for (const kind of ['home', 'about', 'site']) {
  const positions = EXPECTED[kind].map((key) => ({ key, at: page.text.indexOf(`setting-${kind}-${key}`) }))
  const missing = positions.filter((p) => p.at < 0)
  const present = positions.filter((p) => p.at >= 0)
  const sorted = [...present].sort((a, b) => a.at - b.at).map((p) => p.key)
  check(`${kind} 页面顺序符合预期`, missing.length === 0 && JSON.stringify(sorted) === JSON.stringify(EXPECTED[kind]),
    missing.length > 0 ? `未渲染：${missing.map((m) => m.key).join(', ')}` : '顺序一致')
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
