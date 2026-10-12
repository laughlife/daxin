// 并发探测 /api/admin/settings 的四个 kind，复现后台设置页同时发 4 个请求的时序。
// 用于定位「关于我们」面板偶发 500 的原因。
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
  return { status: response.status, text: await response.text() }
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })

console.log('串行请求：')
for (const kind of ['site', 'home', 'about', 'seo']) {
  const response = await call(`/api/admin/settings?kind=${kind}`)
  console.log(`  ${kind.padEnd(6)} HTTP ${response.status}  ${response.status !== 200 ? response.text.slice(0, 160) : ''}`)
}

console.log('\n并发请求（同一时序，模拟设置页）：')
const results = await Promise.all(
  ['site', 'home', 'about', 'seo'].map(async (kind) => ({ kind, ...(await call(`/api/admin/settings?kind=${kind}`)) }))
)
for (const result of results) {
  console.log(`  ${result.kind.padEnd(6)} HTTP ${result.status}  ${result.status !== 200 ? result.text.slice(0, 160) : ''}`)
}
