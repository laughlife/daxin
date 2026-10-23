// 阿里云 OSS 客户端（Signature V1）：上传、删除、公共 URL 与对象键生成。
//
// 为什么单独抽一个模块：upload-assets.mjs、remove-oss-object.mjs 以及
// 公众号封面回填/清理脚本都需要同一套签名逻辑。签名一旦各写一份，
// 很容易出现 CanonicalizedResource 少 bucket 前缀、host 用 endpoint 而非
// 虚拟主机这类问题（历史上就踩过，fetch 直接失败）。
//
// 约定：
// - host 必须是虚拟主机形式 `https://<bucket>.<endpoint>`；
// - CanonicalizedResource 必须带 bucket 前缀；
// - 配置只从 web/.env 读取，任何函数都不打印密钥。
import { createHash, createHmac } from 'node:crypto'
import { join } from 'node:path'

import { REPO_ROOT, readEnvFile } from './mysql-client.mjs'

export const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}

/** 读取 OSS 配置；只返回值，不打印。缺少字段时返回空字符串，由调用方判断。 */
export function readOssConfig() {
  const env = readEnvFile(join(REPO_ROOT, 'web', '.env'))
  return {
    accessKeyId: String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim(),
    accessKeySecret: String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim(),
    endpoint: String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
    bucket: String(env.ALIYUN_OSS_BUCKET ?? '').trim(),
    publicBase: String(env.ALIYUN_OSS_PUBLIC_BASE_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
  }
}

export function isOssConfigComplete(config) {
  return Boolean(config?.accessKeyId && config?.accessKeySecret && config?.endpoint && config?.bucket)
}

export function ossHost(config) {
  return `https://${config.bucket}.${config.endpoint}`
}

/** 对象的公共访问地址；未配置 PUBLIC_BASE_URL 时退回虚拟主机域名。 */
export function publicUrlFor(config, objectKey) {
  const base = config.publicBase || `${config.bucket}.${config.endpoint}`
  return `https://${base}/${objectKey}`
}

/** uuidv5：用命名空间 + 名称做 SHA-1，按 RFC 4122 设置版本位。 */
export function uuidv5(namespace, name) {
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
export const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

/** 生成对象键：`<prefix>/<yyyymmdd>/<uuidv5>.<ext>`，同一来源标识当天重跑会落到同一键。 */
export function objectKeyFor(sourceId, extension, prefix) {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `${prefix ? `${prefix.replace(/\/+$/, '')}/` : ''}${stamp}/${uuidv5(NAMESPACE_URL, sourceId)}${extension}`
}

/** 读取 JPEG / PNG 的像素尺寸；其它格式返回 null，不阻断上传。 */
export function readImageSize(buffer, extension) {
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
  if (extension === '.webp') {
    // RIFF 容器：'RIFF' + 文件长度(4) + 'WEBP' + 若干 chunk
    if (buffer.length < 30) return null
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null
    if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null

    let offset = 12
    while (offset + 8 <= buffer.length) {
      const fourCC = buffer.toString('ascii', offset, offset + 4)
      const chunkSize = buffer.readUInt32LE(offset + 4)

      if (fourCC === 'VP8X') {
        // 扩展格式（含动画）：画布尺寸存为「值减一」的 24 位小端
        const data = offset + 8
        if (data + 10 > buffer.length) return null
        const width = 1 + (buffer[data + 4] | (buffer[data + 5] << 8) | (buffer[data + 6] << 16))
        const height = 1 + (buffer[data + 7] | (buffer[data + 8] << 8) | (buffer[data + 9] << 16))
        return { width, height }
      }
      if (fourCC === 'VP8 ') {
        // 有损：帧头里是 14 位宽高
        const data = offset + 8
        if (data + 10 > buffer.length) return null
        return {
          width: buffer.readUInt16LE(data + 6) & 0x3fff,
          height: buffer.readUInt16LE(data + 8) & 0x3fff,
        }
      }
      if (fourCC === 'VP8L') {
        // 无损：14 位宽高打包在 4 字节里
        const data = offset + 8
        if (data + 5 > buffer.length) return null
        const bits = buffer.readUInt32LE(data + 1)
        return {
          width: 1 + (bits & 0x3fff),
          height: 1 + ((bits >> 14) & 0x3fff),
        }
      }

      // chunk 按偶数字节对齐
      offset += 8 + chunkSize + (chunkSize % 2)
    }
    return null
  }
  return null
}

/** OSS Signature V1 上传（PUT）。 */
export async function putObject(config, { objectKey, body, contentType, timeoutMs = 120000 }) {
  const date = new Date().toUTCString()
  const resource = `/${config.bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  return fetch(`${ossHost(config)}/${objectKey}`, {
    method: 'PUT',
    headers: {
      Date: date,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** OSS Signature V1 删除（DELETE）；对象不存在时同样返回 204/404，视为成功。 */
export async function deleteObject(config, objectKey, { timeoutMs = 60000 } = {}) {
  const date = new Date().toUTCString()
  const resource = `/${config.bucket}/${objectKey}`
  const stringToSign = ['DELETE', '', '', date, resource].join('\n')
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  return fetch(`${ossHost(config)}/${objectKey}`, {
    method: 'DELETE',
    headers: { Date: date, Authorization: `OSS ${config.accessKeyId}:${signature}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** 从图片响应头 / 文件头推断扩展名与 MIME，用于公众号图片（多为 jpeg）。 */
export function sniffImageExtension(buffer, contentType = '', url = '') {
  const header = String(contentType).toLowerCase()
  if (header.includes('png')) return '.png'
  if (header.includes('webp')) return '.webp'
  if (header.includes('gif')) return '.gif'
  if (header.includes('jpeg') || header.includes('jpg')) return '.jpg'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg'
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return '.png'
  if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp'
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') return '.gif'
  const match = /wx_fmt=([a-z]+)/i.exec(String(url))
  if (match && MIME[`.${match[1].toLowerCase()}`]) return `.${match[1].toLowerCase()}`
  return ''
}
