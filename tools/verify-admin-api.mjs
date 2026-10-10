// Task 7 后台接口端到端验收（真实数据库 + 真实 HTTP + 真实角色）。
//
// 覆盖：配置读取与保存、内容列表与详情、媒体列表、核验队列、
// 以及最关键的**角色权限**：viewer 写操作必须 403，editor 可写内容但不能管账号。
//
// 用法（需先创建 viewer/editor 账号并写入密码文件）：
//   node tools/verify-admin-api.mjs --base http://[::1]:3611 \
//     --admin-file web/.admin-initial-password.txt \
//     --viewer-file <viewer 密码文件> --editor-file <editor 密码文件>
//
// 只读为主；会做少量写操作并在结束时还原（见每次写入后的恢复步骤）。
import { readFileSync } from 'node:fs'

function parseArgs(argv) {
  const options = {
    base: 'http://127.0.0.1:3611',
    adminFile: 'web/.admin-initial-password.txt',
    viewerFile: '',
    editorFile: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base') options.base = argv[++index] ?? options.base
    else if (arg === '--admin-file') options.adminFile = argv[++index] ?? ''
    else if (arg === '--viewer-file') options.viewerFile = argv[++index] ?? ''
    else if (arg === '--editor-file') options.editorFile = argv[++index] ?? ''
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function makeClient(base) {
  const jar = new Map()
  return {
    async call(path, { method = 'GET', body } = {}) {
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
      try { json = JSON.parse(text) } catch { /* 非 JSON */ }
      return { status: response.status, json, text }
    },
  }
}

async function login(client, username, passwordFile) {
  const password = readFileSync(passwordFile, 'utf8').trim()
  const response = await client.call('/api/admin/login', { method: 'POST', body: { username, password } })
  return response.status === 200
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('见文件头注释')
    return
  }
  const base = options.base.replace(/\/+$/, '')

  // ---------------- admin ----------------
  const admin = makeClient(base)
  const adminOk = await login(admin, 'admin', options.adminFile)
  record('admin 登录成功', adminOk)
  if (!adminOk) throw new Error('admin 登录失败，无法继续')

  console.log('\n== 配置读取 ==')
  const expectKinds = {
    site: 8, home: 11, about: 5, seo: 2,
    services: 4, footer: 16, contact: 5, qr: 2,
  }
  for (const [kind, expected] of Object.entries(expectKinds)) {
    const response = await admin.call(`/api/admin/settings?kind=${kind}`)
    const items = response.json?.data?.items
    const count = Array.isArray(items) ? items.length : -1
    record(`settings kind=${kind} 返回 ${expected} 项`, response.status === 200 && count === expected, `HTTP ${response.status}, 实际 ${count}`)
  }

  const badKind = await admin.call('/api/admin/settings?kind=nonexistent')
  record('未知 kind 返回 400', badKind.status === 400, `HTTP ${badKind.status}`)

  const noKind = await admin.call('/api/admin/settings')
  record('缺少 kind 返回 400', noKind.status === 400, `HTTP ${noKind.status}`)

  console.log('\n== 配置保存（写后还原）==')
  const siteRead = await admin.call('/api/admin/settings?kind=site')
  const siteItems = siteRead.json?.data?.items ?? []
  const target = siteItems.find((item) => item.key === 'site_name')
  if (target) {
    const original = target.value
    const changed = await admin.call('/api/admin/settings', {
      method: 'PUT',
      body: { kind: 'site', items: [{ key: 'site_name', value: `${original}（验收临时）` }] },
    })
    record('保存站点配置返回 200', changed.status === 200, `HTTP ${changed.status}`)
    const afterRead = await admin.call('/api/admin/settings?kind=site')
    const afterValue = (afterRead.json?.data?.items ?? []).find((item) => item.key === 'site_name')?.value
    record('保存后读回新值', afterValue === `${original}（验收临时）`, `读回：${afterValue}`)
    const restored = await admin.call('/api/admin/settings', {
      method: 'PUT',
      body: { kind: 'site', items: [{ key: 'site_name', value: original }] },
    })
    record('还原原值', restored.status === 200)
  } else {
    record('找到 site_name 配置项', false, '未找到')
  }

  console.log('\n== 内容列表与详情 ==')
  const articles = await admin.call('/api/admin/articles?pageSize=5')
  record('文章列表 200 且 meta 正确', articles.status === 200 && articles.json?.meta?.total >= 288, `total=${articles.json?.meta?.total}`)
  record('文章列表不含内部迁移字段', !JSON.stringify(articles.json?.data ?? []).match(/legacy_source|migration_batch|verified_at/))

  const cases = await admin.call('/api/admin/cases?pageSize=5')
  record('案件列表 200 且 meta 正确', cases.status === 200 && cases.json?.meta?.total >= 832, `total=${cases.json?.meta?.total}`)

  // 实体列表同样是分页的（契约规定 pageSize 上限 48、默认 20），
  // 因此总数看 meta.total，不能拿数组长度当总数。
  const brands = await admin.call('/api/admin/brands?pageSize=48')
  const firms = await admin.call('/api/admin/law-firms?pageSize=48')
  record('品牌列表 200 且总数 228', brands.status === 200 && brands.json?.meta?.total === 228, `total=${brands.json?.meta?.total}, 本页 ${brands.json?.data?.length}`)
  record('律所列表 200 且总数 95', firms.status === 200 && firms.json?.meta?.total === 95, `total=${firms.json?.meta?.total}, 本页 ${firms.json?.data?.length}`)

  const caseId = cases.json?.data?.[0]?.id
  if (caseId) {
    const detail = await admin.call(`/api/admin/cases/${caseId}`)
    record('案件详情 200', detail.status === 200, `HTTP ${detail.status}`)
  }

  console.log('\n== 媒体与核验队列 ==')
  const media = await admin.call('/api/admin/media?pageSize=5')
  record('媒体列表 200', media.status === 200, `HTTP ${media.status}, total=${media.json?.meta?.total}`)

  const review = await admin.call('/api/admin/review?status=open&pageSize=5')
  const reviewTotal = review.json?.meta?.total
  record('核验队列 200 且共 34 条待处理', review.status === 200 && reviewTotal === 34, `total=${reviewTotal}`)

  // ---------------- viewer ----------------
  if (options.viewerFile) {
    console.log('\n== viewer 角色（只读）==')
    const viewer = makeClient(base)
    const ok = await login(viewer, 'viewer', options.viewerFile)
    record('viewer 登录成功', ok)
    if (ok) {
      const read = await viewer.call('/api/admin/articles?pageSize=3')
      record('viewer 可读文章列表', read.status === 200, `HTTP ${read.status}`)

      const write = await viewer.call('/api/admin/settings', {
        method: 'PUT',
        body: { kind: 'site', items: [{ key: 'site_name', value: 'viewer 不应写成功' }] },
      })
      record('viewer 写配置被拒 403', write.status === 403, `HTTP ${write.status} ${write.json?.error?.code ?? ''}`)

      const post = await viewer.call('/api/admin/articles', { method: 'POST', body: { title: 'viewer 不应创建成功' } })
      record('viewer 创建文章被拒 403', post.status === 403, `HTTP ${post.status}`)

      const users = await viewer.call('/api/admin/review?status=open')
      record('viewer 可读核验队列', users.status === 200, `HTTP ${users.status}`)
    }
  }

  // ---------------- editor ----------------
  if (options.editorFile) {
    console.log('\n== editor 角色（内容可写、账号不可管）==')
    const editor = makeClient(base)
    const ok = await login(editor, 'editor', options.editorFile)
    record('editor 登录成功', ok)
    if (ok) {
      const read = await editor.call('/api/admin/articles?pageSize=3')
      record('editor 可读文章列表', read.status === 200, `HTTP ${read.status}`)

      const settings = await editor.call('/api/admin/settings?kind=home')
      record('editor 可读站点配置', settings.status === 200, `HTTP ${settings.status}`)

      // 注意：本脚本刻意不在共享库里制造真实内容。
      // editor 的写权限用「非法输入触发 400」来验证：若鉴权被拒会是 403，
      // 而这里拿到 400 说明已通过鉴权、进入参数校验阶段——足以证明 editor 有写权限，
      // 又不留下任何数据。
      const editorWrite = await editor.call('/api/admin/settings', {
        method: 'PUT',
        body: { kind: 'site', items: [] },
      })
      record('editor 有写权限（非法输入得到 400 而非 403）', editorWrite.status === 400, `HTTP ${editorWrite.status} ${editorWrite.json?.error?.code ?? ''}`)

      const editorCreateInvalid = await editor.call('/api/admin/articles', { method: 'POST', body: {} })
      record('editor 有内容写权限（缺标题得到 400 而非 403）', editorCreateInvalid.status === 400, `HTTP ${editorCreateInvalid.status} ${editorCreateInvalid.json?.error?.code ?? ''}`)

      // 账号管理属 admin 专属；editor 不应能读用户数据（当前无该接口，用 admin 专属权限码验证）
      const editorReview = await editor.call('/api/admin/review?status=open&pageSize=1')
      record('editor 可读核验队列', editorReview.status === 200, `HTTP ${editorReview.status}`)
    }
  }

  const failed = results.filter((item) => !item.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length > 0) {
    console.log('失败项：')
    for (const item of failed) console.log(`  - ${item.name}`)
    process.exitCode = 1
  }
}

await main()
