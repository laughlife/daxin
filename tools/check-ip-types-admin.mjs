// 只读核对：侵权类型字典接口 + 案件编辑页是否正确渲染类型标签。
//
// 目的：确认后台下拉不再依赖「按 seed 顺序猜测 id」，而是读真实的 ip_types 字典。
import { readFileSync } from 'node:fs'

const base = (process.argv[2] ?? 'http://[::1]:4111').replace(/\/+$/, '')
const jar = new Map()

async function call(path, { method = 'GET', body } = {}) {
  const headers = {}
  if (jar.size > 0) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (value === '') jar.delete(name)
    else jar.set(name, value)
  }
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* HTML */ }
  return { status: response.status, json, text }
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })
console.log(`admin 登录 HTTP ${login.status}`)

console.log('\n== 侵权类型字典接口 ==')
const dict = await call('/api/admin/ip-types')
console.log(`HTTP ${dict.status}`)
for (const item of dict.json?.data ?? []) {
  console.log(`  id=${item.id} slug=${item.slug} name=${item.name} sortOrder=${item.sortOrder}`)
}
const slugs = (dict.json?.data ?? []).map((item) => item.slug)
const expected = ['trademark', 'copyright', 'patent', 'unknown']
console.log(`slug 集合与库一致：${JSON.stringify(slugs) === JSON.stringify(expected)}`)

console.log('\n== 未登录访问该字典应被拒 ==')
const anon = await fetch(`${base}/api/admin/ip-types`, { signal: AbortSignal.timeout(30000) })
console.log(`匿名 HTTP ${anon.status}（期望 401）`)

console.log('\n== 案件编辑页 SSR ==')
const page = await call('/admin/cases')
console.log(`HTTP ${page.status}`)
console.log(`含「待确认类型」：${page.text.includes('待确认类型')}`)
console.log(`含「商标」标签：${page.text.includes('商标')}`)
console.log(`含错误态：${/加载失败|未登录或登录已失效/.test(page.text)}`)
console.log(`含来源提示字样：${/旧站|Mock|演示数据/.test(page.text)}`)
