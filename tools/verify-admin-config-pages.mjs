// 后台配置页（settings / services / footer）的端到端检查脚本。
// 用法：node tmp-verify-admin-config.mjs
// 说明：dev server 绑定 IPv6 localhost，必须用 [::1]，127.0.0.1 会被拒绝。
import { readFile } from 'node:fs/promises'

const BASE = 'http://[::1]:3811'
const repoRoot = new URL('../', import.meta.url) // tools/ 的上一级即仓库根目录
const cred = async (name) => (await readFile(new URL(`local-credentials/${name}.txt`, repoRoot), 'utf8')).trim()

const FORBIDDEN = ['旧站', 'Mock', '演示数据']

function fail(message) {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

function ok(message) {
  console.log(`OK   ${message}`)
}

async function login(username, password) {
  const response = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, remember: false })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`login ${username} -> ${response.status} ${text.slice(0, 200)}`)
  const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ')
  if (!cookie) throw new Error(`login ${username} 未返回 Cookie`)
  return cookie
}

async function getPage(path, cookie) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie } })
  const html = await response.text()
  return { status: response.status, html }
}

async function checkPage(path, cookie, needles, notFound) {
  const { status, html } = await getPage(path, cookie)
  if (status !== 200) fail(`${path} 期望 200，实际 ${status}`)
  else ok(`${path} HTTP 200`)
  for (const needle of needles) {
    if (html.includes(needle)) ok(`${path} 含「${needle}」`)
    else fail(`${path} 缺少「${needle}」`)
  }
  for (const needle of FORBIDDEN) {
    if (html.includes(needle)) fail(`${path} 含禁用词「${needle}」`)
  }
  if (notFound !== undefined) {
    const present = html.includes(notFound)
    if (present === false) ok(`${path} 不包含「${notFound}」（符合预期）`)
  }
  return html
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------
const adminPassword = await cred('admin')
const adminCookie = await login('admin', adminPassword)
ok('admin 登录成功')

await checkPage('/admin/settings', adminCookie, ['站点信息', '大信法务', 'home_stats', 'about_team_paragraphs', 'home_right_image'])
await checkPage('/admin/services', adminCookie, ['TRO 全流程处理', 'TRO 和解', 'showDetailLink', '了解详情'])
await checkPage('/admin/footer', adminCookie, ['TRO应诉和解', 'TRO 案件查询', 'contact-wechat-tro', 'qr-tro-consult'])

// viewer 断言：保存按钮 disabled + 只读说明
const viewerPassword = await cred('viewer')
const viewerCookie = await login('viewer', viewerPassword)
ok('viewer 登录成功')

for (const path of ['/admin/settings', '/admin/services', '/admin/footer']) {
  const html = await checkPage(path, viewerCookie, ['当前账号为只读角色，无法保存修改'])
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length
  if (disabledButtons > 0) ok(`${path} 有 ${disabledButtons} 个 disabled 按钮`)
  else fail(`${path} 未渲染出任何 disabled 按钮`)
}

// ---------------------------------------------------------------------------
// mediaId 是否可经 PUT /api/admin/settings 持久化
// ---------------------------------------------------------------------------
async function api(cookie, path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, 'content-type': 'application/json', ...(init?.headers ?? {}) }
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

const site = await api(adminCookie, '/api/admin/settings?kind=site')
const logo = site.payload.data.items.find(item => item.key === 'site_logo')
console.log(`     mediaId 往返测试前的 site_logo: ${JSON.stringify(logo)}`)

// site_logo 尚未关联图片，借一个真实存在的 media_assets.id 验证 PUT 是否真的写入 media_id，
// 验证结束后立刻恢复原值（读取 → 写入 → 读回 → 恢复）。
const PROBE_MEDIA_ID = 3684
if (logo) {
  const put = await api(adminCookie, '/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({
      kind: 'site',
      items: [{ key: 'site_logo', value: logo.value, valueType: 'image', mediaId: PROBE_MEDIA_ID, status: logo.status }]
    })
  })
  const after = await api(adminCookie, '/api/admin/settings?kind=site')
  const afterLogo = after.payload.data.items.find(item => item.key === 'site_logo')
  if (put.status === 200 && afterLogo && afterLogo.mediaId === PROBE_MEDIA_ID) {
    ok(`settings PUT 可持久化 mediaId（写入 ${PROBE_MEDIA_ID}，读回 ${afterLogo.mediaId}，mediaUrl=${afterLogo.mediaUrl}）`)
  } else {
    fail(`settings PUT mediaId 未持久化：put=${JSON.stringify(put)} after=${JSON.stringify(afterLogo)}`)
  }
  // 恢复
  const restore = await api(adminCookie, '/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({
      kind: 'site',
      items: [{ key: 'site_logo', value: logo.value, valueType: 'image', mediaId: logo.mediaId, status: logo.status }]
    })
  })
  const restored = await api(adminCookie, '/api/admin/settings?kind=site')
  const restoredLogo = restored.payload.data.items.find(item => item.key === 'site_logo')
  if (restore.status === 200 && restoredLogo && restoredLogo.mediaId === logo.mediaId) {
    ok(`site_logo 已恢复原值（mediaId=${restoredLogo.mediaId}）`)
  } else {
    fail(`site_logo 未恢复：${JSON.stringify(restoredLogo)}`)
  }
}

// 页面 buildPayload 的等价回灌：footer / contact / services 原样提交，确认服务端接受该形状
for (const kind of ['footer', 'contact', 'services']) {
  const current = await api(adminCookie, `/api/admin/settings?kind=${kind}`)
  const put = await api(adminCookie, '/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ kind, items: current.payload.data.items })
  })
  if (put.status === 200 && put.payload?.data?.kind === kind) {
    ok(`${kind} 回灌 PUT 成功（saved=${put.payload.data.saved}）`)
  } else {
    fail(`${kind} 回灌 PUT 失败：${put.status} ${JSON.stringify(put.payload)}`)
  }
}

// viewer 写接口必须 403
const viewerPut = await api(viewerCookie, '/api/admin/settings', {
  method: 'PUT',
  body: JSON.stringify({ kind: 'site', items: [{ key: 'site_logo', value: '', valueType: 'image', mediaId: null, status: 'published' }] })
})
if (viewerPut.status === 403) ok('viewer PUT /api/admin/settings → 403（与前端禁用一致）')
else fail(`viewer PUT 期望 403，实际 ${viewerPut.status} ${JSON.stringify(viewerPut.payload)}`)
