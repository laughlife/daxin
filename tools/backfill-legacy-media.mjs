// 旧站图片回填 OSS。
//
// 目的：迁移后的 3684 条 media_assets.public_url 全为空，正文里的 <img src="res/...">
// 指向旧站相对路径（公网 404），因此文章配图一张都不显示。本脚本把被引用的图片
// 上传到 OSS，回填 media_assets，并把文章正文里的旧路径改写成新的 OSS 地址。
//
// 对象 key 规则（design 要求 YYYYMMDD/{uuid}.{ext}）：
//   旧路径 res/YYYYMM/DD/<name>.<ext> → YYYYMMDD/<uuid v5>.<ext>
//   uuid 用 UUIDv5(DNS 命名空间, 旧路径)，确定性生成：
//     - 满足 {uuid} 形式要求；
//     - 同一张图重复运行得到同一 key，脚本可安全重跑，不会产生重复对象；
//     - 不依赖随机数，因此结果可复算、可审计。
//
// 用法：
//   node tools/backfill-legacy-media.mjs --dry-run [--limit N]   只报告，不改任何东西
//   node tools/backfill-legacy-media.mjs --apply [--limit N]     真实上传并回填
//   --concurrency N    并发上传数，默认 6
//
// 幂等性：public_url 已非空且对象已存在的记录会被跳过；已改写过的正文不会再次改写
// （改写依据是仍匹配 res/ 路径的 img src）。
import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { executeSqlBatch, queryObjects, quoteLiteral, readEnvFile, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const LEGACY_RES_ROOT = 'C:\\Users\\1\\Desktop\\大信旧官网源码\\da\\res'
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // RFC 4122 DNS 命名空间

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

function parseArgs(argv) {
  const options = { apply: false, dryRun: false, limit: 0, concurrency: 6 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--limit') options.limit = Number(argv[++index] ?? 0)
    else if (arg === '--concurrency') options.concurrency = Number(argv[++index] ?? 6)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** 用 UUIDv5 从旧站相对路径推导确定性的对象 key。 */
function objectKeyFor(legacyPath, extension) {
  const segments = /^res\/(\d{4})(\d{2})\/(\d{2})\//.exec(legacyPath)
  if (!segments) return ''
  const [, year, month, day] = segments
  // UUIDv5：SHA-1(namespace || name)，按 RFC 4122 设置版本位与变体位。
  const namespaceBytes = Buffer.from(UUID_NAMESPACE.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, Buffer.from(legacyPath, 'utf8')])).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  return `${year}${month}${day}/${uuid}.${extension}`
}

function mimeFor(extension) {
  return MIME_BY_EXTENSION[String(extension).toLowerCase()] ?? 'application/octet-stream'
}

/** 读取旧站图片像素尺寸（仅 PNG/JPEG，纯字节解析，无第三方依赖）。 */
function readImageSize(buffer, extension) {
  const ext = String(extension).toLowerCase()
  try {
    if (ext === 'png' && buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    if (ext === 'jpg' || ext === 'jpeg') {
      let offset = 2
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1
          continue
        }
        const marker = buffer[offset + 1]
        const length = buffer.readUInt16BE(offset + 2)
        // SOF0..SOF3、SOF5..SOF7、SOF9..SOF11 等帧头才带尺寸。
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
        }
        offset += 2 + length
      }
    }
  } catch {
    return null
  }
  return null
}

/** OSS Signature V1 上传（PUT）。CanonicalizedResource 必须带 bucket 前缀。 */
async function putObject({ host, bucket, accessKeyId, accessKeySecret, objectKey, body, contentType }) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  const response = await fetch(`${host}/${objectKey}`, {
    method: 'PUT',
    headers: { Date: date, 'Content-Type': contentType, Authorization: `OSS ${accessKeyId}:${signature}` },
    body,
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const code = (/<Code>([^<]*)<\/Code>/.exec(text) ?? [])[1] ?? ''
    throw new Error(`PUT ${objectKey} 失败 HTTP ${response.status} ${code}`)
  }
}

async function headObject({ host, bucket, accessKeyId, accessKeySecret, objectKey }) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['HEAD', '', '', date, resource].join('\n')
  const signature = createHmac('sha1', accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  const response = await fetch(`${host}/${objectKey}`, {
    method: 'HEAD',
    headers: { Date: date, Authorization: `OSS ${accessKeyId}:${signature}` },
    signal: AbortSignal.timeout(30000),
  })
  return response.status
}

const USAGE = `用法：node tools/backfill-legacy-media.mjs <模式> [选项]

模式：
  --dry-run          只统计与校验本地文件，不上传、不改库
  --apply            真实上传到 OSS 并回填 media_assets 与正文

选项：
  --limit N          只处理前 N 条（便于小批量验证）
  --concurrency N    并发上传数，默认 6
`

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return
  }
  if (options.apply === options.dryRun) {
    console.error('必须且只能指定 --dry-run 或 --apply 之一')
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const target = resolveTargetConnection()
  if (!target) {
    console.error('无法解析目标库连接：请检查 web/.env 的 DB_*')
    process.exitCode = 2
    return
  }
  const env = readEnvFile('web/.env')
  const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
  const endpoint = String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '')
  const accessKeyId = String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim()
  const accessKeySecret = String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim()
  let publicBase = String(env.ALIYUN_OSS_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(publicBase)) publicBase = `https://${publicBase}`
  const ossHost = `https://${bucket}.${endpoint}`

  if (!bucket || !endpoint || !accessKeyId || !accessKeySecret) {
    console.error('OSS 配置不完整，无法上传')
    process.exitCode = 2
    return
  }

  // 被正文引用的旧站图片清单，连同其媒体记录。
  const rows = await queryObjects(target, `
SELECT m.id AS media_id, m.object_key AS legacy_path, m.public_url AS public_url, m.byte_size AS byte_size,
       m.mime_type AS mime_type, m.width AS width, m.height AS height
FROM media_assets m
WHERE m.object_key LIKE 'res/%'
ORDER BY m.id
`)
  const limited = options.limit > 0 ? rows.slice(0, options.limit) : rows
  console.log(`媒体记录共 ${rows.length} 条，本次处理 ${limited.length} 条`)
  console.log(`本地图片根目录：${LEGACY_RES_ROOT}（存在：${existsSync(LEGACY_RES_ROOT)}）`)
  console.log(`OSS 目标：${ossHost}，公网根地址：${publicBase}`)

  const plan = []
  const missingLocal = []
  const alreadyDone = []

  for (const row of limited) {
    const legacyPath = String(row.legacy_path ?? '')
    if (String(row.public_url ?? '').trim() !== '') {
      alreadyDone.push(legacyPath)
      continue
    }
    const extension = (legacyPath.split('.').pop() ?? '').toLowerCase()
    const localPath = join(LEGACY_RES_ROOT, legacyPath.replace(/^res\//, '').replace(/\//g, '\\'))
    if (!existsSync(localPath)) {
      missingLocal.push(legacyPath)
      continue
    }
    const objectKey = objectKeyFor(legacyPath, extension)
    if (!objectKey) {
      missingLocal.push(legacyPath)
      continue
    }
    plan.push({ mediaId: Number(row.media_id), legacyPath, localPath, objectKey, extension })
  }

  console.log(`\n待上传：${plan.length}，本地缺失：${missingLocal.length}，已有 public_url（跳过）：${alreadyDone.length}`)
  console.log('对象 key 示例：')
  for (const item of plan.slice(0, 3)) console.log(`  ${item.legacyPath} → ${item.objectKey}`)
  if (missingLocal.length > 0) {
    console.log('本地缺失示例：')
    for (const path of missingLocal.slice(0, 5)) console.log(`  ${path}`)
  }

  if (options.dryRun) {
    console.log('\n--dry-run 结束：未上传、未改库。')
    return
  }

  // 阶段一：并发上传。
  let uploaded = 0
  let uploadFailed = 0
  let cursor = 0
  const failures = []
  const metadata = new Map()

  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency, plan.length || 1)) }, async () => {
    while (cursor < plan.length) {
      const index = cursor
      cursor += 1
      const item = plan[index]
      try {
        const buffer = readFileSync(item.localPath)
        const contentType = mimeFor(item.extension)
        const existing = await headObject({ host: ossHost, bucket, accessKeyId, accessKeySecret, objectKey: item.objectKey })
        if (existing === 200) {
          // 已上传过（脚本重跑）：只补齐数据库元数据。
          metadata.set(item.objectKey, { byteSize: buffer.length, contentType, size: readImageSize(buffer, item.extension) })
          uploaded += 1
          continue
        }
        await putObject({ host: ossHost, bucket, accessKeyId, accessKeySecret, objectKey: item.objectKey, body: buffer, contentType })
        metadata.set(item.objectKey, { byteSize: buffer.length, contentType, size: readImageSize(buffer, item.extension) })
        uploaded += 1
        if (uploaded % 100 === 0) console.log(`  已上传 ${uploaded}/${plan.length}`)
      } catch (error) {
        uploadFailed += 1
        failures.push(`${item.legacyPath}: ${error.message}`)
      }
    }
  })
  await Promise.all(workers)
  console.log(`\n上传完成：成功 ${uploaded}，失败 ${uploadFailed}`)
  if (failures.length > 0) {
    console.log('失败示例：')
    for (const failure of failures.slice(0, 5)) console.log(`  ${failure}`)
  }

  // 阶段二：回填 media_assets 的 public_url、mime_type、byte_size、宽高。
  const updates = []
  for (const item of plan) {
    const meta = metadata.get(item.objectKey)
    if (!meta) continue
    const stat = statSync(item.localPath)
    const width = meta.size?.width && meta.size.width > 0 && meta.size.width <= 65535 ? meta.size.width : null
    const height = meta.size?.height && meta.size.height > 0 && meta.size.height <= 65535 ? meta.size.height : null
    updates.push(`UPDATE media_assets SET
  object_key = ${quoteLiteral(item.objectKey)},
  public_url = ${quoteLiteral(`${publicBase}/${item.objectKey}`)},
  mime_type = ${quoteLiteral(meta.contentType)},
  byte_size = ${stat.size},
  width = ${width ?? 'NULL'},
  height = ${height ?? 'NULL'},
  legacy_source_table = 'cn_res',
  legacy_source_id = 0,
  updated_at = NOW()
WHERE id = ${item.mediaId}`)
  }
  console.log(`\n回填 media_assets：${updates.length} 行`)
  await executeSqlBatch(target, updates)

  // 阶段三：改写文章正文里的旧路径。
  const rewriteMap = new Map(plan.map((item) => {
    const meta = metadata.get(item.objectKey)
    return [item.legacyPath, meta ? `${publicBase}/${item.objectKey}` : '']
  }))

  const articles = await queryObjects(target, `
SELECT id, content_html FROM articles WHERE content_html LIKE '%res/%' ORDER BY id
`)
  let rewritten = 0
  const rewriteStatements = []
  for (const article of articles) {
    const html = String(article.content_html ?? '')
    if (!html.includes('src="res/')) continue
    const next = html.replace(/src="(res\/[^"]+)"/g, (match, legacyPath) => {
      const replacement = rewriteMap.get(legacyPath)
      return replacement ? `src="${replacement}"` : match
    })
    if (next === html) continue
    rewriteStatements.push(`UPDATE articles SET content_html = ${quoteLiteral(next)}, updated_at = NOW() WHERE id = ${Number(article.id)}`)
    rewritten += 1
  }
  console.log(`改写正文含 res/ 图片的文章：${rewritten} 篇`)
  await executeSqlBatch(target, rewriteStatements)

  console.log('\n完成。请核对：')
  console.log('  1) media_assets 中 public_url 非空数量')
  console.log('  2) articles.content_html 中是否仍有 src="res/')
  console.log('  3) 抽查一张图片的公网访问状态码')
}

main().catch((error) => {
  console.error(`回填失败：${error.message}`)
  process.exitCode = 1
})
