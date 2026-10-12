// 验证「站点身份」接线：后台改站点信息后，前台页脚与首页结构化数据应同步变化。
// 只改 contact_phone 与 site_name，验证后立即还原。
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

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })

const before = await call('/api/admin/settings?kind=site')
const items = before.json?.data?.items ?? []
const origPhone = items.find((i) => i.key === 'contact_phone')?.value ?? ''
const origName = items.find((i) => i.key === 'site_name')?.value ?? ''
console.log(`原 contact_phone=${origPhone}  site_name=${origName}`)

const stamp = Date.now()
const probePhone = `1880000${String(stamp).slice(-4)}`
const probeName = `探针站点名${String(stamp).slice(-4)}`

try {
  const next = items.map((i) => {
    if (i.key === 'contact_phone') return { ...i, value: probePhone }
    if (i.key === 'site_name') return { ...i, value: probeName }
    return i
  })
  const put = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'site', items: next } })
  check('保存站点信息', put.status === 200, `HTTP ${put.status}`)

  const page = await call('/')
  check('页脚电话已更新', page.text.includes(probePhone), probePhone)
  check('页脚站点名已更新', page.text.includes(probeName), probeName)

  const match = page.text.match(/application\/ld\+json[^>]*>(\{.*?\})<\/script>/s)
  let ldName = ''
  let ldPhone = ''
  if (match) {
    try {
      const ld = JSON.parse(match[1])
      ldName = ld.name ?? ''
      ldPhone = ld.contactPoint?.[0]?.telephone ?? ''
    } catch { /* 解析失败 */ }
  }
  check('结构化数据站点名已更新', ldName === probeName, ldName)
  check('结构化数据电话已更新', ldPhone === probePhone, ldPhone)
} finally {
  const restore = items.map((i) => {
    if (i.key === 'contact_phone') return { ...i, value: origPhone }
    if (i.key === 'site_name') return { ...i, value: origName }
    return i
  })
  const back = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'site', items: restore } })
  check('还原站点信息', back.status === 200, `HTTP ${back.status}`)
  const page = await call('/')
  check('页脚已还原为原名', page.text.includes(origName) && !page.text.includes(probeName), origName)
  check('页脚已还原为原电话', page.text.includes(origPhone) && !page.text.includes(probePhone), origPhone)
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
