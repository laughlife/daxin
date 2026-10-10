// 把本地素材上传到 OSS 并登记进 media_assets，供后台配置引用。
//
// 用途：需求要求旧站关于我们与首页的介绍图「下载后传入 OSS 并存进后端配置表」。
// 本脚本负责前两步：上传 OSS + 写入 media_assets。
//
// 幂等性：object_key 由 uuidv5(命名空间, 来源标识) 确定性生成，
// 因此同一来源重复执行只会覆盖同一个对象、复用同一行记录，不会产生重复媒体。
//
// 用法：
//   node tools/upload-assets.mjs --dir <本地目录> --source legacy-site [--dry-run]
//   node tools/upload-assets.mjs --files <文件1> <文件2> ... --source legacy-site
import { createHash, createHmac } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { executeSql, queryRows, quoteLiteral, readEnvFile, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const options = { dir: '', files: [], source: 'legacy-site', dryRun: false, prefix: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dir') options.dir = argv[++index] ?? ''
    else if (arg === '--files') {
      index += 1
      while (index < argv.length && !argv[index].startsWith('--')) options.files.push(argv[index++])
      index -= 1
    } else if (arg === '--source') options.source = argv[++index] ?? 'legacy-site'
    else if (arg === '--prefix') options.prefix = argv[++index] ?? ''
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

// ---------------------------------------------------------------- 工具

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}

/** uuidv5：用命名空间 + 名称做 SHA-1，按 RFC 4122 设置版本位。 */
function uuidv5(namespace, name) {
  const hash = createHash('sha1')
  hash.update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
  hash.update(name, 'utf8')
  const bytes = hash.digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** URL 命名空间（RFC 4122 附录 C）。 */
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

function objectKeyFor(sourceId, extension, prefix) {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `${prefix ? `${prefix.replace(/\/+$/, '')}/` : ''}${stamp}/${uuidv5(NAMESPACE_URL, sourceId)}${extension}`
}

/** 读取 JPEG / PNG 的像素尺寸；其它格式返回 null，不阻断上传。 */
function readImageSize(buffer, extension) {
  if (extension === '.png') {
    if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    let offset = 2
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) { offset += 1; continue }
      const marker = buffer[offset + 1]
      // SOF0..SOF15（排除 DHT/DAC 等）
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      }
      const length = buffer.readUInt16BE(offset + 2)
      offset += 2 + length
    }
    return null
  }
  return null
}

/** OSS Signature V1 上传（PUT）。
 *
 * host 必须是 **虚拟主机形式** `https://<bucket>.<endpoint>`；
 * 只传 endpoint（oss-cn-shenzhen.aliyuncs.com）会请求到错误的主机导致 fetch failed。
 * CanonicalizedResource 必须带 bucket 前缀。
 */
async function putObject({ host, bucket, accessKeyId, accessKeySecret, objectKey, body, contentType }) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  return fetch(`${host}/${objectKey}`, {
    method: 'PUT',
    headers: {
      Date: date,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      Authorization: `OSS ${accessKeyId}:${signature}`,
    },
    body,
    signal: AbortSignal.timeout(120000),
  })
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/upload-assets.mjs --dir <目录> 或 --files <文件...> [--source <标识>] [--prefix <OSS前缀>] [--dry-run]')
    return
  }

  // 收集待上传文件
  let files = []
  if (options.dir) {
    files = readdirSync(options.dir)
      .map((name) => join(options.dir, name))
      .filter((path) => statSync(path).isFile() && MIME[extname(path).toLowerCase()])
  }
  files.push(...options.files.filter((path) => MIME[extname(path).toLowerCase()]))
  if (files.length === 0) {
    console.error('没有可上传的图片文件')
    process.exitCode = 2
    return
  }

  const env = readEnvFile('web/.env')
  const oss = {
    accessKeyId: String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim(),
    accessKeySecret: String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim(),
    endpoint: String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
  }
  const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
  const publicBase = String(env.ALIYUN_OSS_PUBLIC_BASE_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!oss.accessKeyId || !oss.accessKeySecret || !oss.endpoint || !bucket) {
    console.error('OSS 配置不完整（需要 ALIYUN_OSS_ACCESS_KEY_ID / SECRET / ENDPOINT / BUCKET）')
    process.exitCode = 2
    return
  }

  const target = options.dryRun ? null : resolveTargetConnection()
  if (!options.dryRun && !target) {
    console.error('无法解析目标库连接（检查 web/.env 的 DB_*）')
    process.exitCode = 2
    return
  }

  console.log(`准备上传 ${files.length} 个文件 → ${bucket}${options.prefix ? `/${options.prefix}` : ''}`)
  const results = []

  for (const path of files) {
    const name = basename(path)
    const extension = extname(name).toLowerCase()
    const contentType = MIME[extension]
    const body = readFileSync(path)
    // 以「来源标识 + 文件名」作为稳定标识，保证重复执行落到同一个对象
    const sourceId = `${options.source}:${name}`
    const objectKey = objectKeyFor(sourceId, extension, options.prefix)
    const size = readImageSize(body, extension)

    if (options.dryRun) {
      console.log(`  [dry-run] ${name} → ${objectKey}  ${Math.round(body.length / 1024)}KB ${size ? `${size.width}x${size.height}` : ''}`)
      continue
    }

    const response = await putObject({ ...oss, host: `https://${bucket}.${oss.endpoint}`, bucket, objectKey, body, contentType })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.log(`  ✖ ${name} 上传失败 HTTP ${response.status} ${text.slice(0, 120)}`)
      results.push({ name, ok: false })
      continue
    }

    const publicUrl = `https://${publicBase || `${bucket}.${oss.endpoint}`}/${objectKey}`
    const title = name.replace(/\.[^.]+$/, '')
    await executeSql(target, `
INSERT INTO media_assets
  (object_key, public_url, file_name, mime_type, byte_size, width, height, usage_scope, title,
   legacy_source_table, legacy_source_id, created_at, updated_at)
VALUES
  (${quoteLiteral(objectKey)}, ${quoteLiteral(publicUrl)}, ${quoteLiteral(name)}, ${quoteLiteral(contentType)},
   ${body.length}, ${size?.width ?? 'NULL'}, ${size?.height ?? 'NULL'}, 'general', ${quoteLiteral(title)},
   ${quoteLiteral(options.source)}, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  public_url = VALUES(public_url), file_name = VALUES(file_name), mime_type = VALUES(mime_type),
  byte_size = VALUES(byte_size), width = VALUES(width), height = VALUES(height),
  title = VALUES(title), deleted_at = NULL, updated_at = NOW()`)

    console.log(`  ✔ ${name} → ${publicUrl}  ${Math.round(body.length / 1024)}KB ${size ? `${size.width}x${size.height}` : ''}`)
    results.push({ name, ok: true, objectKey, publicUrl, width: size?.width, height: size?.height })
  }

  if (!options.dryRun) {
    writeFileSync(join(process.cwd(), 'uploaded-assets.json'), JSON.stringify(results, null, 2))
    console.log(`\n登记完成：${results.filter((item) => item.ok).length}/${results.length}，清单写入 uploaded-assets.json`)
  }
}

main().catch((error) => {
  console.error(`上传失败：${error.message}`)
  process.exitCode = 1
})
