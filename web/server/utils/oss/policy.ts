// 阿里云 OSS PostObject 直传策略。
//
// 浏览器直传流程：接口返回 policy + signature，前端用 FormData 提交到 host；
// accessKeySecret 只参与服务端签名，绝不下发。
import { createHmac } from 'node:crypto'
import { joinPublicUrl, type OssConfig } from './config.ts'

/** 默认上传凭证有效期（秒）。 */
const DEFAULT_EXPIRE_SECONDS = 300

/** 北京时间偏移（UTC+8），用于对象键的日期目录与“今天”的判断。 */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 允许的上传用途；未知用途一律按图片处理，接口层会用 validateUploadRequest 拦截。 */
export const UPLOAD_SCOPES = Object.freeze([
  'logo', 'background', 'banner', 'article', 'about', 'qr', 'general',
] as const)

const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ARTICLE_MIME_TYPES = Object.freeze([...IMAGE_MIME_TYPES, 'application/pdf'])

/** PostObject 表单与前端需要的全部公开字段（不含 accessKeySecret）。 */
export type UploadPolicy = {
  host: string
  key: string
  policy: string
  signature: string
  accessKeyId: string
  /** 过期时刻，毫秒时间戳（与 policy.expiration 的 UTC ISO 字符串同时给出）。 */
  expireAt: number
  maxBytes: number
  allowedMimeTypes: string[]
  publicUrl: string
}

/**
 * 按北京时间（UTC+8）取日历日期，格式 YYYYMMDD。
 * 设计固定使用北京日期分目录：服务器可能跑在 UTC，若按 UTC 计算会在每天 00:00–08:00 少一天。
 */
export function beijingDateKey(date: Date): string {
  const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  const shifted = new Date(source.getTime() + BEIJING_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/** 北京时间当天 00:00 的毫秒时间戳（按 UTC 表示），用于比较日期跨度。 */
export function beijingDayStartMs(date: Date): number {
  const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  const shifted = new Date(source.getTime() + BEIJING_OFFSET_MS)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
}

/** 生成对象键：YYYYMMDD/{uuid}.{ext}；日期为北京日期，扩展名统一小写。 */
export function buildObjectKey(input: { date: Date; uuid: string; extension: string }): string {
  const uuid = String(input?.uuid ?? '').trim().replace(/^\/+/, '')
  if (!uuid) throw new Error('对象键缺少 uuid')
  const extension = String(input?.extension ?? '').trim().replace(/^\.+/, '').toLowerCase()
  if (!extension) throw new Error('对象键缺少文件扩展名')
  return `${beijingDateKey(input.date)}/${uuid}.${extension}`
}

/**
 * 上传用途到 MIME 白名单的映射。
 * 只允许位图（jpeg/png/webp/gif）；文章场景额外允许 PDF。
 * 明确排除 SVG（可携带脚本）、HTML 与可执行文件，避免存储型 XSS 与恶意文件分发。
 */
export function allowedMimeTypesFor(scope: string): string[] {
  const normalized = String(scope ?? '').trim().toLowerCase()
  return normalized === 'article' ? [...ARTICLE_MIME_TYPES] : [...IMAGE_MIME_TYPES]
}

/** MIME 是否在用途白名单内；忽略大小写与 charset 等参数。 */
export function isAllowedMimeType(scope: string, mimeType: string): boolean {
  const normalized = String(mimeType ?? '').trim().toLowerCase().split(';')[0]?.trim() ?? ''
  if (!normalized) return false
  return allowedMimeTypesFor(scope).includes(normalized)
}

/**
 * 构造合法的 OSS PostObject 策略。
 * 要点：
 *   - expiration 必须是 UTC 且以 Z 结尾（阿里云拒绝 +08:00 形式）；
 *   - conditions 固定包含 bucket、key 精确匹配、大小区间与 **Content-Type 精确匹配**；
 *   - policy 为 { expiration, conditions } 文档的 base64；
 *   - signature 为 HMAC-SHA1(secret, policy) 的 base64。
 *
 * 为什么 Content-Type 用 eq 精确匹配而不是 starts-with 空前缀：
 * 原先写 `['starts-with', '$Content-Type', '']`，等于对 Content-Type 不加任何约束。
 * 浏览器可以自行改写表单里的 Content-Type，因此攻击者能拿着合法签发的策略上传
 * 任意类型对象（例如 text/html，构成存储型 XSS；或可执行文件分发）。
 * 登记接口的白名单是事后校验，无法撤销已经上传到桶里的对象。
 * 现在把校验通过的 MIME 固化进签名条件，提交时类型不一致会被 OSS 直接拒绝。
 *
 * 为什么用 SHA1 而不是 SHA256：本桶实测只有 HMAC-SHA1 能通过 OSS 校验，
 * HMAC-SHA256（以及十六进制、URL 编码、补换行等变体）一律返回
 * 403 SignatureDoesNotMatch。同一把 AccessKey 的 Signature V1（HMAC-SHA1）
 * 直连请求可以正常读写，说明凭据无误，是 PostObject 的校验规则如此。
 * 这里保留 SHA1 以匹配阿里云实际行为；policy 由服务端生成且 5 分钟过期，
 * 签名强度不构成实际风险。
 */
export function createPostObjectPolicy(input: {
  config: OssConfig
  objectKey: string
  /** 校验通过的精确 MIME 类型；未提供时回退到该用途白名单的第一项。 */
  mimeType?: string
  maxBytes?: number
  expireSeconds?: number
  now?: Date
  usageScope?: string
}): UploadPolicy {
  const { config, objectKey } = input
  const usageScope = input.usageScope ?? 'general'
  const allowed = allowedMimeTypesFor(usageScope)
  // 策略里只允许一个精确类型：优先用调用方校验过的类型，否则退回白名单首项。
  const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim()
    ? input.mimeType.trim().toLowerCase().split(';')[0]?.trim() ?? ''
    : allowed[0] ?? 'application/octet-stream'
  const requestedMaxBytes = input.maxBytes
  const maxBytes = typeof requestedMaxBytes === 'number'
    && Number.isSafeInteger(requestedMaxBytes)
    && requestedMaxBytes > 0
    ? requestedMaxBytes
    : config.uploadMaxBytes
  const requestedExpireSeconds = input.expireSeconds
  const expireSeconds = typeof requestedExpireSeconds === 'number'
    && Number.isFinite(requestedExpireSeconds)
    && requestedExpireSeconds > 0
    ? Math.floor(requestedExpireSeconds)
    : DEFAULT_EXPIRE_SECONDS
  const issuedAt = input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date()
  const expireAtMs = issuedAt.getTime() + expireSeconds * 1000

  const conditions = [
    { bucket: config.bucket },
    ['eq', '$key', objectKey],
    ['content-length-range', 1, maxBytes],
    // 精确匹配：提交的 Content-Type 必须与签发的完全一致
    ['eq', '$Content-Type', mimeType],
  ]

  // 阿里云要求的 policy 文档结构：{ expiration, conditions }。
  // expiration 用 toISOString() 生成，一定是 UTC 且以 Z 结尾（阿里云拒绝 +08:00）。
  const document = { expiration: new Date(expireAtMs).toISOString(), conditions }
  const policy = Buffer.from(JSON.stringify(document), 'utf8').toString('base64')
  // 阿里云 PostObject 使用 HMAC-SHA1(base64 policy)，实测 SHA256 会被拒。
  const signature = createHmac('sha1', config.accessKeySecret).update(policy).digest('base64')

  return {
    host: config.host,
    key: objectKey,
    policy,
    signature,
    accessKeyId: config.accessKeyId,
    expireAt: expireAtMs,
    maxBytes,
    allowedMimeTypes: allowed,
    publicUrl: joinPublicUrl(config, objectKey),
  }
}
