// 验证 PostObject 策略是否真的把 Content-Type 约束住了。
//
// 做法：用同一份 policy 提交两次表单，唯一差别是 Content-Type 字段：
//   A) 与签发时一致的 image/png  → 期望 204/200
//   B) 改成 text/html（想上传 HTML 的典型手法）→ 期望被 OSS 拒绝（403）
// 两次都带上签名，证明拒绝来自 policy 条件而不是签名错误。
//
// 用法：node tools/verify-oss-mime-pinning.mjs --base http://127.0.0.1:3002 [--keep]
import { readFileSync, writeFileSync } from 'node:fs'

const base = (() => {
  const index = process.argv.indexOf('--base')
  return (index !== -1 ? process.argv[index + 1] : 'http://127.0.0.1:3002').replace(/\/+$/, '')
})()

/** 生成一张最小的合法 PNG（1x1 透明）。 */
function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
}

const jar = new Map()
async function call(path, options = {}) {
  const headers = {}
  if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(base + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(60000),
  })
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  return { status: response.status, json, text }
}

/** 取一份签发给 image/png 的策略。 */
async function issuePolicy() {
  const result = await call('/api/admin/upload-policy', {
    method: 'POST',
    body: { fileName: 'mime-probe.png', byteSize: 1024, mimeType: 'image/png', usageScope: 'general' },
  })
  if (result.status !== 200 || !result.json?.data) {
    throw new Error(`获取策略失败：HTTP ${result.status} ${result.text.slice(0, 200)}`)
  }
  return result.json.data
}

/** 用给定 Content-Type 提交表单。 */
async function postForm(policy, contentType, bytes) {
  const form = new FormData()
  form.append('key', policy.key)
  form.append('policy', policy.policy)
  form.append('OSSAccessKeyId', policy.accessKeyId)
  form.append('signature', policy.signature)
  form.append('success_action_status', '200')
  // 关键：Content-Type 由客户端自行声明
  const blob = new Blob([bytes], { type: contentType })
  form.append('file', blob, 'mime-probe.png')
  const response = await fetch(policy.host, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000),
  })
  const text = await response.text().catch(() => '')
  return { status: response.status, text: text.slice(0, 300) }
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })
console.log(`admin 登录 HTTP ${login.status}`)

const png = tinyPng()
const results = []

// A) 一致的 image/png：应当成功
const policyA = await issuePolicy()
const a = await postForm(policyA, 'image/png', png)
console.log(`\nA) Content-Type=image/png（与签发一致）→ HTTP ${a.status}`)
results.push({ case: '一致类型', status: a.status, ok: a.status === 200 || a.status === 204 })

// B) 同一份签名，改成 text/html：应当被拒绝
const b = await postForm(policyA, 'text/html', png)
console.log(`B) Content-Type=text/html（同一份策略改写）→ HTTP ${b.status}`)
if (b.text) console.log(`   响应：${b.text.replace(/\s+/g, ' ').slice(0, 160)}`)
results.push({ case: '改写为 text/html', status: b.status, ok: b.status === 403 })

// C) 改成 application/pdf：同样应被拒绝（策略只允许 image/png）
const policyC = await issuePolicy()
const c = await postForm(policyC, 'application/pdf', png)
console.log(`C) Content-Type=application/pdf（同一份策略改写）→ HTTP ${c.status}`)
results.push({ case: '改写为 application/pdf', status: c.status, ok: c.status === 403 })

console.log('\n================ 结果 ================')
for (const item of results) console.log(`  ${item.ok ? '✔' : '✖'} ${item.case}：HTTP ${item.status}`)
const passed = results.filter((item) => item.ok).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)

// 记录成功上传的对象键，便于运维清理（策略签发的对象无法通过接口删除）
const uploaded = results.filter((item) => item.status === 200 || item.status === 204)
if (uploaded.length > 0) {
  writeFileSync('oss-mime-probe.json', JSON.stringify({ key: policyA.key, publicUrl: policyA.publicUrl }, null, 2))
  console.log(`成功上传的对象：${policyA.key}`)
  console.log('（对象键已写入 oss-mime-probe.json，如需清理请用 tools/cleanup-verify-media.mjs 或手工删除）')
}

process.exitCode = passed === results.length ? 0 : 1
