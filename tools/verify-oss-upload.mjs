// OSS 直传端到端验收脚本。
//
// 用途：在没有浏览器的情况下，独立验证「服务端签发 policy → 表单直传 OSS →
// 服务端 HEAD 校验并登记 media_assets」这条链路，并覆盖边界拒绝项。
//
// 用法（需先启动 dev server，并把密码文件放好）：
//   node tools/verify-oss-upload.mjs --base http://[::1]:3011 \
//     --username admin --password-file web/.admin-initial-password.txt
//
// 只读取 web/.env 的 OSS 配置；不打印任何密钥或签名内容。
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import { readEnvFile } from './migrate-legacy/mysql-client.mjs'

function parseArgs(argv) {
  const options = { base: 'http://127.0.0.1:3011', username: 'admin', passwordFile: 'web/.admin-initial-password.txt', size: 1024 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base') options.base = argv[++index] ?? options.base
    else if (arg === '--username') options.username = argv[++index] ?? options.username
    else if (arg === '--password-file') options.passwordFile = argv[++index] ?? options.passwordFile
    else if (arg === '--size') options.size = Number(argv[++index] ?? options.size)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** 生成一张最小合法 PNG，避免引入图像库依赖。 */
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
  ihdr[8] = 8
  ihdr[9] = 2
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
  const idat = deflateSync(Buffer.concat(rows))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('见文件头注释')
    return
  }

  const env = readEnvFile('web/.env')
  const password = readFileSync(options.passwordFile, 'utf8').trim()
  const base = options.base.replace(/\/+$/, '')
  const cookieJar = new Map()

  const cookieHeader = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

  async function call(path, { method = 'GET', body, raw } = {}) {
    const headers = {}
    if (cookieJar.size > 0) headers.cookie = cookieHeader()
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (value === '') cookieJar.delete(name)
      else cookieJar.set(name, value)
    }
    return raw ? response : { status: response.status, json: await response.json().catch(() => null) }
  }

  // 1) 未登录必须被拒
  const anon = await call('/api/admin/upload-policy', { method: 'POST', body: { fileName: 'a.png', byteSize: 100, mimeType: 'image/png' } })
  record('未登录请求 upload-policy 被拒绝（401）', anon.status === 401, `HTTP ${anon.status}`)

  // 2) 登录
  const login = await call('/api/admin/login', { method: 'POST', body: { username: options.username, password } })
  record('管理员登录成功', login.status === 200, `HTTP ${login.status}`)
  if (login.status !== 200) throw new Error('登录失败，无法继续验收')

  // 3) 非法 MIME 必须被拒
  const badMime = await call('/api/admin/upload-policy', { method: 'POST', body: { fileName: 'evil.html', byteSize: 100, mimeType: 'text/html', usageScope: 'article' } })
  record('非法 MIME（text/html）被拒（400）', badMime.status === 400, `HTTP ${badMime.status} ${badMime.json?.error?.code ?? ''}`)

  // 4) 超过 20MB 必须被拒
  const tooBig = await call('/api/admin/upload-policy', { method: 'POST', body: { fileName: 'big.png', byteSize: 20971521, mimeType: 'image/png', usageScope: 'article' } })
  record('超过 20MB 被拒（400）', tooBig.status === 400, `HTTP ${tooBig.status} ${tooBig.json?.error?.code ?? ''}`)

  // 5) 合法申请必须返回不含密钥的 policy
  const png = makePng(8, 8)
  const policy = await call('/api/admin/upload-policy', { method: 'POST', body: { fileName: 'probe.png', byteSize: png.length, mimeType: 'image/png', usageScope: 'article' } })
  record('合法申请返回 200', policy.status === 200, `HTTP ${policy.status}`)
  const data = policy.json?.data
  record('响应不含 accessKeySecret', data && !('accessKeySecret' in data) && !JSON.stringify(data).includes(String(env.ALIYUN_OSS_ACCESS_KEY_SECRET)))
  record('policy 含必要字段', Boolean(data?.host && data?.key && data?.policy && data?.signature && data?.accessKeyId && data?.expireAt))
  if (!data?.host) throw new Error('未获得 upload policy，无法继续')

  // 6) 真正直传 OSS
  const form = new FormData()
  form.append('key', data.key)
  form.append('policy', data.policy)
  form.append('signature', data.signature)
  form.append('OSSAccessKeyId', data.accessKeyId)
  form.append('success_action_status', '200')
  form.append('file', new Blob([png], { type: 'image/png' }), 'probe.png')
  const upload = await fetch(data.host, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
  record('表单直传 OSS 成功（200/204）', upload.status === 200 || upload.status === 204, `HTTP ${upload.status}`)
  if (!(upload.status === 200 || upload.status === 204)) {
    console.log('  OSS 返回片段：' + (await upload.text()).slice(0, 300))
  }

  // 7) 服务端 HEAD 校验并登记
  const register = await call('/api/admin/media', {
    method: 'POST',
    body: { objectKey: data.key, byteSize: png.length, mimeType: 'image/png', fileName: 'probe.png', usageScope: 'article', title: '验收探针图片', width: 8, height: 8 },
  })
  record('服务端校验并登记 media_assets（200）', register.status === 200, `HTTP ${register.status} ${register.json?.error?.message ?? ''}`)
  const media = register.json?.data?.media
  record('登记返回公共访问地址', Boolean(media?.publicUrl), media?.publicUrl ?? '')

  // 8) 伪造不存在的对象必须被拒
  const ghost = await call('/api/admin/media', {
    method: 'POST',
    body: { objectKey: '20260101/' + randomUUID() + '.png', byteSize: 100, mimeType: 'image/png', usageScope: 'article' },
  })
  record('不存在的对象被拒（400）', ghost.status === 400, `HTTP ${ghost.status} ${ghost.json?.error?.code ?? ''}`)

  // 9) 路径穿越必须被拒
  const traversal = await call('/api/admin/media', {
    method: 'POST',
    body: { objectKey: '../etc/passwd.png', byteSize: 100, mimeType: 'image/png', usageScope: 'article' },
  })
  record('路径穿越 key 被拒（400）', traversal.status === 400, `HTTP ${traversal.status} ${traversal.json?.error?.code ?? ''}`)

  // 10) 重复登记不应产生重复行
  const again = await call('/api/admin/media', {
    method: 'POST',
    body: { objectKey: data.key, byteSize: png.length, mimeType: 'image/png', fileName: 'probe.png', usageScope: 'article' },
  })
  record('重复登记幂等（同一 media id）', again.status === 200 && again.json?.data?.media?.id === media?.id, `id=${media?.id} → ${again.json?.data?.media?.id}`)

  const failed = results.filter((item) => !item.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length > 0) {
    console.log('失败项：' + failed.map((item) => item.name).join('；'))
    process.exitCode = 1
  }
}

await main()
