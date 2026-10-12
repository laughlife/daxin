// 验证侧边栏标记（articles.show_in_sidebar）在后台接口上端到端可用。
//
// 只改自己创建的一条测试文章并立即清理，不触碰既有 288 篇文章。
//
// 用法：node tools/verify-sidebar-flag.mjs [--base http://127.0.0.1:3002]
import { readFileSync } from 'node:fs'

const base = (() => {
  const index = process.argv.indexOf('--base')
  return (index !== -1 ? process.argv[index + 1] : 'http://127.0.0.1:3002').replace(/\/+$/, '')
})()

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
    const i = pair.indexOf('=')
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
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
  results.push({ name, ok })
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })
check('admin 登录', login.status === 200, `HTTP ${login.status}`)

const stamp = Date.now()
const slug = `sidebar-probe-${stamp}`
let createdId = null

try {
  // 1) 创建时带 showInSidebar
  const created = await call('/api/admin/articles', {
    method: 'POST',
    body: {
      title: `侧边栏探针 ${stamp}`,
      slug,
      summary: '用于验证 show_in_sidebar 字段的临时文章',
      contentHtml: '<p>探针</p>',
      status: 'draft',
      showInSidebar: true,
    },
  })
  createdId = created.json?.data?.id ?? null
  check('创建文章并带 showInSidebar=true', created.status === 200 && createdId !== null, `HTTP ${created.status} id=${createdId}`)

  // 2) 列表里能读到该标记
  const list = await call(`/api/admin/articles?keyword=${encodeURIComponent(slug)}&pageSize=5`)
  const item = (list.json?.data ?? []).find((row) => row.slug === slug)
  check('列表中返回 showInSidebar 字段', Boolean(item) && item.showInSidebar === true, `showInSidebar=${item?.showInSidebar}`)

  // 3) 详情里也能读到
  const detail = await call(`/api/admin/articles/${createdId}`)
  const detailItem = detail.json?.data?.article
  check('详情中返回 showInSidebar', detailItem?.showInSidebar === true, `showInSidebar=${detailItem?.showInSidebar}`)

  // 4) 更新为 false 生效
  const updated = await call(`/api/admin/articles/${createdId}`, { method: 'PUT', body: { showInSidebar: false } })
  check('更新 showInSidebar=false', updated.status === 200 && updated.json?.data?.article?.showInSidebar === false,
    `HTTP ${updated.status} showInSidebar=${updated.json?.data?.article?.showInSidebar}`)

  // 5) 富文本 HTML 完整入库（含 img 的 OSS 地址）
  const html = '<p style="font-size:18px;font-weight:700">富文本<b>加粗</b></p><img src="https://example.com/a.png" alt="图">'
  await call(`/api/admin/articles/${createdId}`, { method: 'PUT', body: { contentHtml: html } })
  const afterHtml = await call(`/api/admin/articles/${createdId}`)
  check('富文本 HTML 原样入库', afterHtml.json?.data?.article?.contentHtml === html,
    `长度=${String(afterHtml.json?.data?.article?.contentHtml ?? '').length}`)
} finally {
  // 清理：删除接口是软删除（status='archived'），行会留在库里污染文章数，
  // 因此这里改为直接从数据库硬删除自己创建的那条探针。
  if (createdId !== null) {
    const { executeSql, resolveTargetConnection } = await import('./migrate-legacy/mysql-client.mjs')
    const target = resolveTargetConnection()
    await executeSql(target, `DELETE FROM article_images WHERE article_id = ${createdId}`)
    await executeSql(target, `DELETE FROM articles WHERE id = ${createdId}`)
    check('清理测试文章（硬删除）', true, `已删除 id=${createdId}`)
  }
}

const passed = results.filter((r) => r.ok).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
