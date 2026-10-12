// 验证多图字段的保存往返：取 about 组 → 改一个图片键 → PUT → 读回比对 → 还原。
// 只改 about_honors_images（当前为空数组），避免动到真实图。
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

const before = await call('/api/admin/settings?kind=about')
const items = before.json?.data?.items ?? []
const target = items.find((i) => i.key === 'about_honors_images')
const original = target?.value ?? '[]'
console.log(`原 about_honors_images = ${original}`)

const probe = 'https://example.com/probe-image-for-roundtrip.png'
try {
  const next = items.map((i) => (i.key === 'about_honors_images' ? { ...i, value: JSON.stringify([probe]) } : i))
  const put = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'about', items: next } })
  check('保存多图数组', put.status === 200, `HTTP ${put.status}`)

  const after = await call('/api/admin/settings?kind=about')
  const savedValue = (after.json?.data?.items ?? []).find((i) => i.key === 'about_honors_images')?.value ?? ''
  let saved = null
  try { saved = JSON.parse(savedValue) } catch { /* 非 JSON */ }
  check('读回是数组且含探针地址', Array.isArray(saved) && saved.includes(probe), String(savedValue))

  // 页面应渲染出 1 张
  const page = await call('/admin/settings')
  const at = page.text.indexOf('setting-about-about_honors_images')
  const slice = at >= 0 ? page.text.slice(at, at + 900) : ''
  check('页面该字段渲染为 1 张', /共 1 张/.test(slice), (slice.match(/共 \d+ 张/) ?? [''])[0])
} finally {
  const restore = items.map((i) => (i.key === 'about_honors_images' ? { ...i, value: original } : i))
  const back = await call('/api/admin/settings', { method: 'PUT', body: { kind: 'about', items: restore } })
  check('还原原值', back.status === 200, `HTTP ${back.status}`)
  const verify = await call('/api/admin/settings?kind=about')
  const restored = (verify.json?.data?.items ?? []).find((i) => i.key === 'about_honors_images')?.value ?? ''
  check('确认已还原', restored === original, `值=${restored}`)
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
