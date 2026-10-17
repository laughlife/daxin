#!/usr/bin/env node
// Task 9 全链路端到端验收：admin 登录 → 站点配置 → OSS 媒体 → 公开读取。
//
// 目标：用**真实 HTTP（实时 dev server）+ 真实 MySQL**证明数据从后台写入到
// 前台公开接口的完整链路可用，并覆盖迁移数据、分页夹取、角色权限与审计留痕。
//
// 用法：
//   node tools/e2e-data-flow.mjs --base http://[::1]:4411
//
// 设计约束（非破坏性）：
//   - 本脚本创建的媒体行会在本次运行内被软删除（DELETE 只置 deleted_at，不物理删行）；
//   - 唯一的共享配置写入（site_logo）在验证完公开读取后立刻还原，并在结束时读回比对；
//   - 角色权限用「viewer 写 → 403」「editor 非法输入 → 400」验证，不制造任何内容；
//   - 审计日志只通过 tools/migrate-legacy/mysql-client.mjs 做只读查询；
//   - 从不修改 web/.env，从不打印密码、令牌或任何 OSS 签名内容。
//
// 依赖：仅 Node 内置模块 + 仓库既有的只读 MySQL 客户端。无新增 npm 依赖。
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

/** 仓库根目录：脚本在 tools/ 下，向上一级即根。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 普通接口超时；每个网络调用都必须带超时，避免验收挂死。 */
const REQUEST_TIMEOUT_MS = 30_000
/** OSS 直传 / HEAD 校验超时（跨公网，给得更宽）。 */
const OSS_TIMEOUT_MS = 60_000

function parseArgs(argv) {
  const options = {
    base: 'http://[::1]:4411',
    credentialsDir: 'local-credentials',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base') options.base = argv[++index] ?? options.base
    else if (arg === '--credentials-dir') options.credentialsDir = argv[++index] ?? options.credentialsDir
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** 读取本地密码文件；返回值只用于登录，不进入任何日志。 */
function readPassword(credentialsDir, role) {
  const path = join(credentialsDir, `${role}.txt`)
  let value = ''
  try {
    value = readFileSync(path, 'utf8').trim()
  } catch (error) {
    throw new Error(`无法读取 ${role} 的本地密码文件 ${path}：${error.message}`)
  }
  if (!value) throw new Error(`本地密码文件 ${path} 为空`)
  return value
}

/** 生成一张最小合法 PNG（8x8，真彩），避免引入任何图像库依赖。 */
function makePng(width = 8, height = 8) {
  const crcTable = (() => {
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    return table
  })()
  const crc32 = (buffer) => {
    let crc = -1
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ -1) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBuffer = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
    return Buffer.concat([length, typeBuffer, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 2 // 颜色类型：真彩 RGB
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = (x * 32) % 256
      row[2 + x * 3] = (y * 32) % 256
      row[3 + x * 3] = 128
    }
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// 极简断言 / 检查框架
// ---------------------------------------------------------------------------

const results = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/** 失败信息必须带上 HTTP 状态码与服务端错误码，便于直接定位。 */
function describeResponse(response) {
  const code = response.json?.error?.code
  const message = response.json?.error?.message
  const tail = [code, message].filter(Boolean).join(' ')
  if (tail) return tail.slice(0, 200)
  return String(response.text ?? '').replace(/\s+/g, ' ').slice(0, 120)
}

/** 断言状态码；失败时明确报出实际状态码。 */
function expectStatus(response, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (allowed.includes(response.status)) return
  const detail = describeResponse(response)
  throw new Error(`期望 HTTP ${allowed.join('/')}，实际 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
}

/** 执行一个检查项：成功打 ✔，抛错打 ✖，绝不中断整轮验收。 */
async function check(name, fn) {
  try {
    const detail = await fn()
    const text = typeof detail === 'string' ? detail : ''
    results.push({ name, ok: true, detail: text })
    console.log(`✔ ${name}${text ? ` — ${text}` : ''}`)
    return { ok: true, value: detail }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, detail: text })
    console.log(`✖ ${name} — ${text}`)
    return { ok: false, error }
  }
}

// ---------------------------------------------------------------------------
// HTTP 客户端（带 Cookie jar）
// ---------------------------------------------------------------------------

/**
 * 简单 cookie jar：只保留 name=value 对，忽略属性。
 * 所有请求都带 AbortSignal.timeout，保证任何上游卡顿都不会让验收悬停。
 */
function createClient(base) {
  const jar = new Map()

  async function request(path, options = {}) {
    const { method = 'GET', body, timeoutMs = REQUEST_TIMEOUT_MS } = options
    const headers = {}
    if (jar.size > 0) {
      headers.cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
    }
    if (body !== undefined) headers['content-type'] = 'application/json'

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    // 解析 set-cookie：值为空表示清除该 cookie。
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const index = pair.indexOf('=')
      if (index <= 0) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (value === '') jar.delete(name)
      else jar.set(name, value)
    }

    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // 非 JSON 响应（例如反向代理错误页）：保留原文用于失败信息。
    }
    return { status: response.status, json, text }
  }

  return { request, jar }
}

// ---------------------------------------------------------------------------
// 只读 DB 访问（仅用于审计表间接校验）
// ---------------------------------------------------------------------------

function targetConnection() {
  const connection = resolveTargetConnection()
  if (!connection) {
    throw new Error('无法解析目标数据库连接：web/.env 缺少 DB_* 配置，且本机没有可用的 mysql login-path')
  }
  return connection
}

/** 审计表中 action='settings_update' 的记录数与最大 id（只读）。 */
async function auditStats() {
  const rows = await queryRows(
    targetConnection(),
    "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM admin_audit_logs WHERE action = 'settings_update'",
  )
  const row = rows[0] ?? []
  return { count: Number(row[0] ?? 0), maxId: Number(row[1] ?? 0) }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/** 结束时要打印的「恢复状态」汇总。 */
const state = {
  createdMediaId: null,
  createdMediaPublicUrl: '',
  mediaSoftDeleted: false,
  ossObjectKey: '',
  preExistingMediaId: null,
  siteLogoBefore: null,
  siteLogoAfterRestore: null,
  /** 修改前公开接口返回的 site_logo 值（已考虑 media_url 覆盖取值） */
  siteLogoPublicBefore: '',
}

/** 读取后台配置项；找不到返回 null。 */
async function readAdminSetting(client, kind, key) {
  const response = await client.request(`/api/admin/settings?kind=${kind}`)
  expectStatus(response, 200)
  const items = response.json?.data?.items
  assert(Array.isArray(items), `响应缺少 data.items（HTTP ${response.status}）`)
  return items.find(item => item.key === key) ?? null
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/e2e-data-flow.mjs [--base http://[::1]:4411] [--credentials-dir local-credentials]')
    return
  }

  const base = options.base.replace(/\/+$/, '')
  const credentialsDir = isAbsolute(options.credentialsDir)
    ? options.credentialsDir
    : join(REPO_ROOT, options.credentialsDir)

  console.log('Task 9 端到端验收（实时服务 + 真实 MySQL）')
  console.log(`base=${base}`)
  console.log(`凭据目录=${credentialsDir}（只读取，不打印密码）\n`)

  const admin = createClient(base)
  const viewer = createClient(base)
  const editor = createClient(base)
  // 公开接口用独立的无 Cookie 客户端，确保验证的是真正的匿名读取。
  const publicClient = createClient(base)

  // ---------------- 1. 登录与身份 ----------------
  console.log('== 1. 登录与身份 ==')
  const loginResult = await check('POST /api/admin/login（admin）返回 200', async () => {
    const response = await admin.request('/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: readPassword(credentialsDir, 'admin') },
    })
    expectStatus(response, 200)
    return `user=${response.json?.data?.user?.username ?? ''}`
  })
  if (!loginResult.ok) {
    // 登录失败后面所有检查都没有意义，直接汇总退出（非零）。
    console.log('\nadmin 登录失败，终止后续检查。')
    printSummary()
    process.exitCode = 1
    return
  }

  await check('GET /api/admin/me 返回 200 且 roles 含 admin', async () => {
    const response = await admin.request('/api/admin/me')
    expectStatus(response, 200)
    const roles = response.json?.data?.user?.roles
    assert(Array.isArray(roles), `响应缺少 data.user.roles（HTTP ${response.status}）`)
    assert(roles.includes('admin'), `roles=${JSON.stringify(roles)} 不含 admin`)
    return `roles=${roles.join(',')}`
  })

  // ---------------- 2. 配置读取 ----------------
  console.log('\n== 2. 配置读取（真实种子数据）==')
  for (const kind of ['site', 'home', 'about']) {
    await check(`GET /api/admin/settings?kind=${kind} 返回 200 且 items 非空`, async () => {
      const response = await admin.request(`/api/admin/settings?kind=${kind}`)
      expectStatus(response, 200)
      const items = response.json?.data?.items
      assert(Array.isArray(items) && items.length > 0, `data.items 为空（HTTP ${response.status}）`)
      return `items=${items.length}`
    })
  }

  const seededValues = [
    ['site', 'site_name', '大信法务'],
    ['about', 'about_hero_title', '深圳市大信法务咨询有限公司'],
    ['home', 'home_hero_title', '/images/home-hero-title.png'],
  ]
  for (const [kind, key, expected] of seededValues) {
    await check(`${key} 的种子值等于「${expected}」`, async () => {
      const item = await readAdminSetting(admin, kind, key)
      assert(item, `kind=${kind} 中未找到配置项 ${key}`)
      assert(item.value === expected, `实际值 ${JSON.stringify(item.value)}，期望 ${JSON.stringify(expected)}`)
      return ''
    })
  }

  // ---------------- 3. OSS 媒体登记 ----------------
  console.log('\n== 3. OSS 媒体登记（Task 5 链路）==')
  const png = makePng(8, 8)
  let policy = null

  await check('POST /api/admin/upload-policy 返回 200 且不含 accessKeySecret', async () => {
    const response = await admin.request('/api/admin/upload-policy', {
      method: 'POST',
      body: { fileName: 'e2e-probe.png', byteSize: png.length, mimeType: 'image/png', usageScope: 'article' },
    })
    expectStatus(response, 200)
    policy = response.json?.data
    assert(policy && typeof policy === 'object', `响应缺少 data（HTTP ${response.status}）`)
    assert(!('accessKeySecret' in policy), 'data 中出现了 accessKeySecret 字段')
    const suspicious = Object.keys(policy).filter(key => key !== 'accessKeyId' && /secret|credential|password|token/i.test(key))
    assert(suspicious.length === 0, `data 含疑似敏感字段：${suspicious.join(',')}`)
    for (const field of ['host', 'key', 'policy', 'signature', 'accessKeyId']) {
      assert(policy[field], `data 缺少字段 ${field}`)
    }
    return `host=${String(policy.host).replace(/\/+$/, '')}`
  })

  await check('表单直传 OSS 返回 200/204', async () => {
    assert(policy?.host && policy?.key, '上一步未取得可用的上传策略')
    const form = new FormData()
    form.append('key', policy.key)
    form.append('policy', policy.policy)
    form.append('signature', policy.signature)
    form.append('OSSAccessKeyId', policy.accessKeyId)
    form.append('success_action_status', '200')
    form.append('file', new Blob([png], { type: 'image/png' }), 'e2e-probe.png')
    const response = await fetch(policy.host, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(OSS_TIMEOUT_MS),
    })
    assert([200, 204].includes(response.status), `期望 HTTP 200/204，实际 HTTP ${response.status}`)
    state.ossObjectKey = String(policy.key)
    return `HTTP ${response.status} key=${state.ossObjectKey}`
  })

  await check('POST /api/admin/media 登记返回 200 与 publicUrl', async () => {
    assert(policy?.key, '缺少对象键，无法登记')
    const response = await admin.request('/api/admin/media', {
      method: 'POST',
      body: {
        objectKey: policy.key,
        byteSize: png.length,
        mimeType: 'image/png',
        fileName: 'e2e-probe.png',
        usageScope: 'article',
        title: 'Task9 验收探针（脚本自动创建）',
        width: 8,
        height: 8,
      },
    })
    expectStatus(response, 200)
    const media = response.json?.data?.media
    assert(media && Number(media.id) > 0, `响应缺少 media.id（HTTP ${response.status}）`)
    assert(media.publicUrl, '响应缺少 media.publicUrl')
    state.createdMediaId = Number(media.id)
    state.createdMediaPublicUrl = String(media.publicUrl)
    return `mediaId=${state.createdMediaId} publicUrl=${media.publicUrl}`
  })

  await check('HEAD 登记返回的 publicUrl 返回 200', async () => {
    assert(state.createdMediaPublicUrl, '上一步未取得 publicUrl，无法 HEAD 校验')
    const head = await fetch(state.createdMediaPublicUrl, { method: 'HEAD', signal: AbortSignal.timeout(OSS_TIMEOUT_MS) })
    assert(head.status === 200, `期望 HTTP 200，实际 HTTP ${head.status}`)
    return `HTTP ${head.status} ${state.createdMediaPublicUrl}`
  })

  await check('DELETE /api/admin/media/{id} 软删除返回 200', async () => {
    assert(state.createdMediaId, '缺少媒体 id')
    const response = await admin.request(`/api/admin/media/${state.createdMediaId}`, { method: 'DELETE' })
    expectStatus(response, 200)
    state.mediaSoftDeleted = true
    return `id=${state.createdMediaId} deletedAt=${response.json?.data?.deletedAt ?? ''}`
  })

  await check('软删除为归档而非物理删除（includeDeleted=1 仍能读到该行）', async () => {
    assert(state.createdMediaId, '缺少媒体 id')
    const response = await admin.request('/api/admin/media?pageSize=48&includeDeleted=1')
    expectStatus(response, 200)
    const row = (response.json?.data ?? []).find(item => Number(item.id) === state.createdMediaId)
    assert(row, `includeDeleted=1 时未读到 id=${state.createdMediaId}，行可能被物理删除`)
    assert(row.deletedAt, '该行 deletedAt 为空，软删除未生效')
    return `deletedAt=${row.deletedAt}`
  })

  // ---------------- 4. 配置写入 → 公开读取 ----------------
  console.log('\n== 4. 配置写入 → 公开读取（写后还原）==')

  // 审计基线必须在写操作之前记录（只读查询）。
  let auditBaseline = null
  let auditBaselineError = null
  try {
    auditBaseline = await auditStats()
  } catch (error) {
    auditBaselineError = error instanceof Error ? error : new Error(String(error))
  }

  await check('读取 site_logo 原值（供还原使用）', async () => {
    const item = await readAdminSetting(admin, 'site', 'site_logo')
    assert(item, 'kind=site 中未找到 site_logo')
    state.siteLogoBefore = {
      value: item.value,
      valueType: item.valueType,
      mediaId: item.mediaId,
      status: item.status,
      mediaUrl: item.mediaUrl ?? '',
    }
    // 公开接口在配置关联了媒体时用 media_url 覆盖取值，因此「原值」不能只看 value：
    // 必须记下修改前公开接口实际返回的值，还原后与它比对才是正确口径。
    // （site_logo 已配置官方 logo，mediaUrl 非空，只比 value 会误判为未回退。）
    const publicResponse = await publicClient.request('/api/public/settings')
    expectStatus(publicResponse, 200)
    state.siteLogoPublicBefore = String(publicResponse.json?.data?.settings?.site_logo ?? '')
    return `mediaId=${item.mediaId} valueType=${item.valueType} mediaUrl=${item.mediaUrl || '(空)'} 公开值=${state.siteLogoPublicBefore ? '非空' : '(空)'}`
  })

  let preExistingMedia = null
  await check('GET /api/admin/media?pageSize=1 取得已存在的媒体行', async () => {
    const response = await admin.request('/api/admin/media?pageSize=1')
    expectStatus(response, 200)
    const row = response.json?.data?.[0]
    assert(row?.id, '媒体库为空，无法取得已存在的媒体行')
    // 必须使用「本次未创建」的行；刚创建的行已软删除，不应出现在普通列表中。
    assert(Number(row.id) !== state.createdMediaId, '取到了本次新建的媒体行，应使用已存在的行')
    preExistingMedia = row
    state.preExistingMediaId = Number(row.id)
    return `mediaId=${row.id} publicUrl=${row.publicUrl}`
  })

  await check('PUT /api/admin/settings 把 site_logo 指向已有媒体 → 200', async () => {
    assert(state.siteLogoBefore, '缺少 site_logo 原值')
    assert(preExistingMedia?.id, '缺少已存在的媒体 id')
    const response = await admin.request('/api/admin/settings', {
      method: 'PUT',
      body: {
        kind: 'site',
        items: [{
          key: 'site_logo',
          value: state.siteLogoBefore.value,
          valueType: 'image',
          mediaId: Number(preExistingMedia.id),
          status: 'published',
        }],
      },
    })
    expectStatus(response, 200)
    return `saved=${response.json?.data?.saved ?? ''} mediaId=${preExistingMedia.id}`
  })

  await check('GET /api/public/settings 可见新的 site_logo 媒体地址', async () => {
    const response = await publicClient.request('/api/public/settings')
    expectStatus(response, 200)
    const value = response.json?.data?.settings?.site_logo
    assert(typeof value === 'string' && value.length > 0, `公开配置中 site_logo 为空：${JSON.stringify(value)}`)
    assert(/^https?:\/\//.test(value), `site_logo 公开值不是绝对 URL：${JSON.stringify(value)}`)
    assert(value === preExistingMedia?.publicUrl, `公开值 ${value} 与媒体 publicUrl ${preExistingMedia?.publicUrl} 不一致`)
    return `site_logo=${value}`
  })

  await check('还原 site_logo 原值 → 200', async () => {
    const before = state.siteLogoBefore
    assert(before, '缺少 site_logo 原值')
    const response = await admin.request('/api/admin/settings', {
      method: 'PUT',
      body: {
        kind: 'site',
        items: [{
          key: 'site_logo',
          value: before.value,
          valueType: before.valueType,
          mediaId: before.mediaId,
          status: before.status,
        }],
      },
    })
    expectStatus(response, 200)
    return ''
  })

  await check('还原后读回 site_logo 与原值一致', async () => {
    const before = state.siteLogoBefore
    assert(before, '缺少 site_logo 原值')
    const item = await readAdminSetting(admin, 'site', 'site_logo')
    assert(item, '还原后未读到 site_logo')
    assert(item.mediaId === before.mediaId, `mediaId=${item.mediaId}，期望 ${before.mediaId}`)
    assert(item.value === before.value, `value=${JSON.stringify(item.value)}，期望 ${JSON.stringify(before.value)}`)
    assert((item.mediaUrl ?? '') === before.mediaUrl, `mediaUrl=${item.mediaUrl}，期望 ${before.mediaUrl}`)
    state.siteLogoAfterRestore = {
      value: item.value,
      valueType: item.valueType,
      mediaId: item.mediaId,
      status: item.status,
      mediaUrl: item.mediaUrl ?? '',
    }
    return `mediaId=${item.mediaId} value=${JSON.stringify(item.value)}`
  })

  await check('还原后公开配置中的 site_logo 同步回退', async () => {
    const response = await publicClient.request('/api/public/settings')
    expectStatus(response, 200)
    const value = String(response.json?.data?.settings?.site_logo ?? '')
    // 与「修改前公开接口返回的值」比对（该值已考虑 media_url 覆盖取值的语义）
    assert(
      value === state.siteLogoPublicBefore,
      `公开值 ${JSON.stringify(value)} 未回退到原值 ${JSON.stringify(state.siteLogoPublicBefore)}`,
    )
    return `site_logo=${JSON.stringify(value)}`
  })

  // ---------------- 5. 迁移数据 → 公开案件查询 ----------------
  console.log('\n== 5. 迁移数据 → 公开案件查询 ==')
  let caseNumber = ''

  await check('GET /api/public/cases?pageSize=5 返回 200 且 meta.total ≥ 800', async () => {
    const response = await publicClient.request('/api/public/cases?pageSize=5')
    expectStatus(response, 200)
    const meta = response.json?.meta
    const rows = response.json?.data
    assert(meta && Number.isFinite(Number(meta.total)), `响应缺少 meta.total（HTTP ${response.status}）`)
    assert(Number(meta.total) >= 800, `meta.total=${meta.total}，应 ≥ 800`)
    assert(Array.isArray(rows) && rows.length > 0, 'data 为空')
    return `total=${meta.total} 本页=${rows.length}`
  })

  await check('案件行携带 caseNumber/filedAt/lawFirm/plaintiffName/plaintiffBrand/caseType/caseTypes', async () => {
    const response = await publicClient.request('/api/public/cases?pageSize=5')
    expectStatus(response, 200)
    const rows = response.json?.data ?? []
    assert(rows.length > 0, 'data 为空')
    const required = ['caseNumber', 'filedAt', 'lawFirm', 'plaintiffName', 'plaintiffBrand', 'caseType', 'caseTypes']
    for (const [index, row] of rows.entries()) {
      for (const field of required) {
        assert(field in row, `第 ${index + 1} 行缺少字段 ${field}`)
      }
      assert(typeof row.caseNumber === 'string' && row.caseNumber.length > 0, `第 ${index + 1} 行 caseNumber 为空`)
      assert(typeof row.plaintiffName === 'string', `第 ${index + 1} 行 plaintiffName 不是字符串`)
      assert(Array.isArray(row.caseTypes), `第 ${index + 1} 行 caseTypes 不是数组`)
    }
    caseNumber = rows[0].caseNumber
    return `本页 ${rows.length} 行均含必需字段，取 caseNumber=${caseNumber}`
  })

  await check('案件行不暴露 legacy_source_* / migration_batch_id / verified_at', async () => {
    const response = await publicClient.request('/api/public/cases?pageSize=5')
    expectStatus(response, 200)
    const serialized = JSON.stringify(response.json?.data ?? [])
    for (const field of ['legacy_source_table', 'legacy_source_id', 'migration_batch_id', 'verified_at']) {
      assert(!serialized.includes(field), `响应中出现内部迁移字段 ${field}`)
    }
    return ''
  })

  await check('GET /api/public/cases/{caseNumber} 返回 200', async () => {
    assert(caseNumber, '缺少 caseNumber')
    const response = await publicClient.request(`/api/public/cases/${encodeURIComponent(caseNumber)}`)
    expectStatus(response, 200)
    assert(response.json?.data?.caseNumber === caseNumber, `详情 caseNumber=${response.json?.data?.caseNumber} 与请求不一致`)
    return caseNumber
  })

  // ---------------- 6. 分页夹取 ----------------
  console.log('\n== 6. 分页夹取 ==')
  await check('?page=99999&pageSize=999 被夹取（page=totalPages，pageSize≤48）', async () => {
    const response = await publicClient.request('/api/public/cases?page=99999&pageSize=999')
    expectStatus(response, 200)
    const meta = response.json?.meta
    const rows = response.json?.data
    assert(meta, `响应缺少 meta（HTTP ${response.status}）`)
    assert(Array.isArray(rows), 'data 不是数组')
    assert(Number(meta.pageSize) <= 48, `meta.pageSize=${meta.pageSize}，应 ≤ 48`)
    assert(Number(meta.page) <= Number(meta.totalPages), `meta.page=${meta.page} 大于 meta.totalPages=${meta.totalPages}`)
    assert(Number(meta.page) === Number(meta.totalPages), `meta.page=${meta.page} 应等于 meta.totalPages=${meta.totalPages}`)
    assert(rows.length <= Number(meta.pageSize), `data 长度 ${rows.length} 超过 pageSize=${meta.pageSize}`)
    return `page=${meta.page}/${meta.totalPages} pageSize=${meta.pageSize} 本页=${rows.length}`
  })

  // ---------------- 7. 品牌 / 律所详情 ----------------
  console.log('\n== 7. 品牌 / 律所详情 ==')
  let brandSlug = ''
  await check('GET /api/public/brands?pageSize=5 返回 200 且含 brand-* slug', async () => {
    const response = await publicClient.request('/api/public/brands?pageSize=5')
    expectStatus(response, 200)
    const rows = response.json?.data
    assert(Array.isArray(rows) && rows.length > 0, `data 为空（HTTP ${response.status}）`)
    const match = rows.find(row => /^brand-/.test(String(row.slug)))
    assert(match, `本页未取到 brand-* slug：${rows.map(row => row.slug).join(', ')}`)
    brandSlug = String(match.slug)
    return `slug=${brandSlug}`
  })

  await check('GET /api/public/brands/{slug} 返回 200 且含 brand 与 cases 数组', async () => {
    assert(brandSlug, '缺少品牌 slug')
    const response = await publicClient.request(`/api/public/brands/${encodeURIComponent(brandSlug)}`)
    expectStatus(response, 200)
    const data = response.json?.data
    assert(data?.brand?.slug === brandSlug, `data.brand.slug=${data?.brand?.slug} 与请求不一致`)
    assert(Array.isArray(data?.cases), 'data.cases 不是数组')
    return `cases=${data.cases.length}`
  })

  let firmSlug = ''
  await check('GET /api/public/law-firms?pageSize=5 返回 200 且含 law-firm-* slug', async () => {
    const response = await publicClient.request('/api/public/law-firms?pageSize=5')
    expectStatus(response, 200)
    const rows = response.json?.data
    assert(Array.isArray(rows) && rows.length > 0, `data 为空（HTTP ${response.status}）`)
    const match = rows.find(row => /^law-firm-/.test(String(row.slug)))
    assert(match, `本页未取到 law-firm-* slug：${rows.map(row => row.slug).join(', ')}`)
    firmSlug = String(match.slug)
    return `slug=${firmSlug}`
  })

  await check('GET /api/public/law-firms/{slug} 返回 200 且含 firm 与 cases 数组', async () => {
    assert(firmSlug, '缺少律所 slug')
    const response = await publicClient.request(`/api/public/law-firms/${encodeURIComponent(firmSlug)}`)
    expectStatus(response, 200)
    const data = response.json?.data
    assert(data?.firm?.slug === firmSlug, `data.firm.slug=${data?.firm?.slug} 与请求不一致`)
    assert(Array.isArray(data?.cases), 'data.cases 不是数组')
    return `cases=${data.cases.length}`
  })

  // ---------------- 8. 文章 → 首页 ----------------
  console.log('\n== 8. 文章 → 首页 ==')
  let articleSlug = ''
  await check('GET /api/public/articles?pageSize=3 返回 200 且 imageSrc 全为 https', async () => {
    const response = await publicClient.request('/api/public/articles?pageSize=3')
    expectStatus(response, 200)
    const rows = response.json?.data
    assert(Array.isArray(rows) && rows.length > 0, `data 为空（HTTP ${response.status}）`)
    for (const [index, row] of rows.entries()) {
      assert(row.slug, `第 ${index + 1} 行缺少 slug`)
      const src = row.imageSrc
      assert(src === null || /^https:\/\//.test(String(src)), `第 ${index + 1} 行 imageSrc 非 https：${JSON.stringify(src)}`)
      assert(!/res\//i.test(String(src ?? '')), `第 ${index + 1} 行 imageSrc 含旧站 res/ 路径：${src}`)
    }
    assert(rows.some(row => typeof row.imageSrc === 'string' && /^https:\/\//.test(row.imageSrc)), '没有任何一行带 https 配图')
    articleSlug = String(rows[0].slug)
    return `本页 ${rows.length} 篇，首篇 slug=${articleSlug}`
  })

  await check('GET /api/public/home 返回 200 且四个案例分类栏目结构正确', async () => {
    const response = await publicClient.request('/api/public/home')
    expectStatus(response, 200)
    const data = response.json?.data
    assert(Array.isArray(data?.featuredCases) && data.featuredCases.length > 0, 'featuredCases 为空')
    // 首页案例模块为四类、每类最多三篇（需求 2026-10-10），字段是 articleColumns
    const columns = data?.articleColumns
    assert(Array.isArray(columns) && columns.length === 4, `articleColumns 应为 4 类，实际 ${JSON.stringify(columns?.length)}`)
    const slugs = columns.map((column) => column.slug)
    assert(
      JSON.stringify(slugs) === JSON.stringify(['tro-alert', 'tro-success', 'labor-case', 'freight-case']),
      `分类顺序不符：${JSON.stringify(slugs)}`,
    )
    for (const column of columns) {
      assert(Array.isArray(column.articles), `${column.slug} 的 articles 不是数组`)
      assert(column.articles.length <= 3, `${column.slug} 超过三篇：${column.articles.length}`)
    }
    const total = columns.reduce((sum, column) => sum + column.articles.length, 0)
    assert(total > 0, '四类栏目合计没有任何文章')
    return `featuredCases=${data.featuredCases.length} 分类=${slugs.join('/')} 各篇数=${columns.map((c) => c.articles.length).join(',')}`
  })

  await check('GET /api/public/articles/{slug} 的 html 无 script / on* 事件 / res 路径', async () => {
    assert(articleSlug, '缺少文章 slug')
    const response = await publicClient.request(`/api/public/articles/${encodeURIComponent(articleSlug)}`)
    expectStatus(response, 200)
    const html = String(response.json?.data?.html ?? '')
    assert(!/<script/i.test(html), 'html 中出现 <script')
    assert(!/\son[a-z]+\s*=/i.test(html), 'html 中出现 on* 事件属性')
    assert(!/res\//i.test(html), 'html 中出现旧站 res/ 路径')
    return `html 长度=${html.length}`
  })

  // ---------------- 9. 运行时角色权限 ----------------
  console.log('\n== 9. 运行时角色权限 ==')
  await check('viewer 登录返回 200', async () => {
    const response = await viewer.request('/api/admin/login', {
      method: 'POST',
      body: { username: 'viewer', password: readPassword(credentialsDir, 'viewer') },
    })
    expectStatus(response, 200)
    return ''
  })

  await check('viewer PUT /api/admin/settings → 403', async () => {
    const response = await viewer.request('/api/admin/settings', {
      method: 'PUT',
      body: { kind: 'site', items: [{ key: 'site_name', value: 'viewer 不应写成功' }] },
    })
    expectStatus(response, 403)
    return `code=${response.json?.error?.code ?? ''}`
  })

  await check('viewer POST /api/admin/articles → 403', async () => {
    // 故意提交空 body：即使鉴权被绕过，也只会得到 400，绝不会创建数据。
    const response = await viewer.request('/api/admin/articles', { method: 'POST', body: {} })
    expectStatus(response, 403)
    return `code=${response.json?.error?.code ?? ''}`
  })

  await check('viewer GET /api/admin/articles → 200', async () => {
    const response = await viewer.request('/api/admin/articles?pageSize=3')
    expectStatus(response, 200)
    return `HTTP ${response.status}`
  })

  await check('editor 登录返回 200', async () => {
    const response = await editor.request('/api/admin/login', {
      method: 'POST',
      body: { username: 'editor', password: readPassword(credentialsDir, 'editor') },
    })
    expectStatus(response, 200)
    return ''
  })

  await check('editor PUT /api/admin/settings 空 items → 400（证明已通过鉴权）', async () => {
    // 空 items 是非法输入：若鉴权被拒会是 403，这里拿到 400 说明 editor 有写权限，
    // 同时不会在共享库里写下任何配置。
    const response = await editor.request('/api/admin/settings', {
      method: 'PUT',
      body: { kind: 'site', items: [] },
    })
    expectStatus(response, 400)
    return `code=${response.json?.error?.code ?? ''}`
  })

  // ---------------- 10. 审计日志（只读 DB 校验）----------------
  console.log('\n== 10. 审计日志（只读 DB 校验）==')
  await check('admin_audit_logs 出现本次写入产生的 settings_update 记录', async () => {
    if (auditBaselineError) throw new Error(`写入前读取审计表失败：${auditBaselineError.message}`)
    const after = await auditStats()
    assert(after.count >= 1, `settings_update 记录数 ${after.count}，应 ≥ 1`)
    assert(
      auditBaseline && after.maxId > auditBaseline.maxId,
      `最大 id 未增长（${auditBaseline?.maxId} → ${after.maxId}），未观察到本次写入的审计记录`,
    )
    return `settings_update 记录数 ${auditBaseline.count} → ${after.count}，最大 id ${auditBaseline.maxId} → ${after.maxId}`
  })

  printSummary()
}

/** 打印中文汇总与恢复状态；返回失败数，供调用方决定退出码。 */
function printSummary() {
  const failed = results.filter(item => !item.ok)
  console.log('\n==================== 验收汇总 ====================')
  console.log(`总检查项：${results.length}，通过：${results.length - failed.length}，失败：${failed.length}`)
  if (failed.length > 0) {
    console.log('失败项：')
    for (const item of failed) console.log(`  ✖ ${item.name} — ${item.detail}`)
  }

  console.log('恢复 / 未改动状态：')
  if (state.siteLogoAfterRestore) {
    console.log(
      `  - site_logo：已还原（value=${JSON.stringify(state.siteLogoAfterRestore.value)}，`
      + `mediaId=${state.siteLogoAfterRestore.mediaId}，mediaUrl=${JSON.stringify(state.siteLogoAfterRestore.mediaUrl || '')}；`
      + '就地 UPDATE、version+1，未新增行）',
    )
  } else {
    console.log('  - site_logo：未能确认还原，请查看失败项')
  }
  console.log(
    state.createdMediaId
      ? `  - 媒体行：id=${state.createdMediaId} ${state.mediaSoftDeleted ? '已软删除（仅置 deleted_at，行仍保留）' : '未完成软删除'}`
      : '  - 媒体行：本次未创建',
  )
  console.log(
    state.ossObjectKey
      ? `  - OSS 对象：${state.ossObjectKey} 已上传（接口无删除能力，对象保留在 OSS）`
      : '  - OSS 对象：无',
  )
  console.log('  - 测试文章：0 篇（viewer 创建被 403 拒绝，editor 只提交非法输入）')
  console.log('  - admin_audit_logs：仅新增审计记录，未修改、未删除任何历史记录')
  console.log('  - web/.env 与数据库其他行：未写入、未删除；全程未打印任何密码或令牌')
  console.log('==================================================')

  return failed.length
}

try {
  await main()
} catch (error) {
  console.log(`\n✖ 验收脚本异常终止 — ${error instanceof Error ? error.message : String(error)}`)
  printSummary()
  process.exitCode = 1
}
