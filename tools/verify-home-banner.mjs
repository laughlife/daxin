// 验证首页 Banner 接入：写入 home_banner_image → 首页应渲染该图 → 清空后应完全不渲染。
//
// 用一张既有的 OSS 图片做探针，验证后把配置还原为空。
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

// 取一张既有 OSS 图片作为探针
const probe = 'https://dxfw-oss.oss-cn-shenzhen.aliyuncs.com/legacy-site/20261010/d3f76441-b9fc-579f-846b-2c7e86430caf.jpg'

const before = await call('/api/admin/settings?kind=home')
const items = before.json?.data?.items ?? []
const original = items.find((i) => i.key === 'home_banner_image')?.value ?? ''
console.log(`原 home_banner_image = ${JSON.stringify(original)}`)

// 前置：未配置时应不渲染 banner 区块
const pageBefore = await call('/')
check('未配置时不渲染 banner 区块', !pageBefore.text.includes('home-banner__img'))

try {
  const next = items.map((i) => (i.key === 'home_banner_image' ? { ...i, value: probe } : i))
  const put = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'home', items: next } })
  check('写入 home_banner_image', put.status === 200, `HTTP ${put.status}`)

  const page = await call('/')
  check('首页渲染 banner 区块', page.text.includes('home-banner__img'))
  check('banner 使用配置的图片地址', page.text.includes(probe), probe.slice(-28))
} finally {
  const restore = items.map((i) => (i.key === 'home_banner_image' ? { ...i, value: original } : i))
  const back = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'home', items: restore } })
  check('还原配置', back.status === 200, `HTTP ${back.status}`)
  const pageAfter = await call('/')
  check('清空后不再渲染 banner', !pageAfter.text.includes('home-banner__img'))
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
