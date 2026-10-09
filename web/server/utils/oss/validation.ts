// 上传请求与媒体登记的入库前校验。
//
// 全部为纯函数：不连数据库、不访问网络，失败时返回稳定机器码 + 简体中文提示。
import { joinPublicUrl, type OssConfig } from './config.ts'
import { UPLOAD_SCOPES, beijingDayStartMs, isAllowedMimeType } from './policy.ts'

/** 公网访问地址（定义在 config.ts，这里按上传模块的命名约定统一导出）。 */
export const buildPublicUrl = joinPublicUrl

/** 上传相关错误：code 供前端分支处理，message 直接展示给用户。 */
export type UploadValidationError = { code: string; message: string }

export type ValidationResult = { ok: true } | { ok: false; error: UploadValidationError }

/** 对象键日期最多可回溯的天数：更早的凭证视为过期，避免旧键重放登记。 */
const REGISTRATION_MAX_AGE_DAYS = 7

const MAX_FILE_NAME_LENGTH = 255

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 对象键格式：北京日期目录 / uuid.ext；扩展名限定为已放行的类型。 */
const OBJECT_KEY_PATTERN = /^\d{8}\/[0-9a-fA-F-]{8,64}\.(jpe?g|png|webp|gif|pdf)$/

const SCOPES = new Set<string>(UPLOAD_SCOPES)

function fail(code: string, message: string): ValidationResult {
  return { ok: false, error: { code, message } }
}

/** 接受数字或纯数字字符串（表单/JSON 都会带字符串），其余视为非法。 */
function toByteSize(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

/** 是否为上传用途白名单中的值。 */
export function isAllowedUsageScope(scope: unknown): boolean {
  return SCOPES.has(String(scope ?? '').trim().toLowerCase())
}

/** 判断字节数是否在上传上限内：恰好等于上限通过，多 1 字节即失败。 */
export function isWithinUploadLimit(byteSize: number, config: Pick<OssConfig, 'uploadMaxBytes'>): boolean {
  return Number.isSafeInteger(byteSize) && byteSize > 0 && byteSize <= config.uploadMaxBytes
}

/** 校验签发上传凭证前的请求元数据。 */
export function validateUploadRequest(
  input: {
    fileName?: unknown
    byteSize?: unknown
    mimeType?: unknown
    usageScope?: unknown
  },
  config: OssConfig,
): ValidationResult {
  const fileName = String(input?.fileName ?? '').trim()
  if (!fileName) return fail('file_name_required', '文件名不能为空')
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    return fail('file_name_too_long', `文件名长度不能超过 ${MAX_FILE_NAME_LENGTH} 个字符`)
  }

  const byteSize = toByteSize(input?.byteSize)
  if (byteSize === null || byteSize <= 0) return fail('byte_size_invalid', '文件大小必须是正整数（字节）')
  if (!isWithinUploadLimit(byteSize, config)) {
    return fail('byte_size_too_large', `文件大小超出上限（最大 ${config.uploadMaxBytes} 字节）`)
  }

  const usageScope = String(input?.usageScope ?? '').trim().toLowerCase()
  if (!isAllowedUsageScope(usageScope)) {
    return fail('usage_scope_invalid', `上传用途不合法：${usageScope || '（空）'}`)
  }

  const mimeType = String(input?.mimeType ?? '').trim().toLowerCase()
  if (!isAllowedMimeType(usageScope, mimeType)) {
    return fail('mime_type_not_allowed', `不支持的文件类型：${mimeType || '（空）'}`)
  }

  return { ok: true }
}

/** 解析对象键中的日期段；非真实日历日期返回 null。 */
function parseObjectKeyDate(dateKey: string): number | null {
  const year = Number(dateKey.slice(0, 4))
  const month = Number(dateKey.slice(4, 6))
  const day = Number(dateKey.slice(6, 8))
  if (year < 1970 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const timestamp = Date.UTC(year, month - 1, day)
  const checked = new Date(timestamp)
  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
  ) {
    return null
  }
  return timestamp
}

/** 扩展名推断用途，用于判断 MIME 是否放行（图片任何用途均可，PDF 仅限文章）。 */
function scopeForObjectKey(objectKey: string): string {
  return objectKey.toLowerCase().endsWith('.pdf') ? 'article' : 'general'
}

/** 校验上传完成后的媒体登记：对象键形态、日期窗口、大小与类型。 */
export function validateMediaRegistration(
  input: { objectKey?: unknown; byteSize?: unknown; mimeType?: unknown },
  config: OssConfig,
  options: { now?: Date; today?: Date } = {},
): ValidationResult {
  const objectKey = String(input?.objectKey ?? '').trim()
  if (!objectKey) return fail('object_key_required', '对象键不能为空')

  // 路径穿越、绝对路径与外部 URL 一律拒绝，避免越权覆盖或外链登记。
  if (objectKey.includes('..') || objectKey.includes('\\') || objectKey.startsWith('/') || objectKey.includes('://')) {
    return fail('object_key_unsafe', '对象键不合法：包含非法路径片段')
  }
  if (!OBJECT_KEY_PATTERN.test(objectKey)) {
    return fail('object_key_invalid', '对象键格式不合法')
  }

  const keyDay = parseObjectKeyDate(objectKey.slice(0, 8))
  if (keyDay === null) return fail('object_key_date_invalid', '对象键日期不合法')

  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime())
    ? options.now
    : options.today instanceof Date && !Number.isNaN(options.today.getTime())
      ? options.today
      : new Date()
  const ageDays = Math.round((beijingDayStartMs(now) - keyDay) / MS_PER_DAY)
  if (ageDays < 0) return fail('object_key_date_future', '对象键日期不能晚于今天')
  if (ageDays > REGISTRATION_MAX_AGE_DAYS) {
    return fail('object_key_date_expired', `对象键日期已过期（最多 ${REGISTRATION_MAX_AGE_DAYS} 天）`)
  }

  const byteSize = toByteSize(input?.byteSize)
  if (byteSize === null || byteSize <= 0) return fail('byte_size_invalid', '文件大小必须是正整数（字节）')
  if (!isWithinUploadLimit(byteSize, config)) {
    return fail('byte_size_too_large', `文件大小超出上限（最大 ${config.uploadMaxBytes} 字节）`)
  }

  const mimeType = String(input?.mimeType ?? '').trim().toLowerCase()
  if (!isAllowedMimeType(scopeForObjectKey(objectKey), mimeType)) {
    return fail('mime_type_not_allowed', `不支持的文件类型：${mimeType || '（空）'}`)
  }

  return { ok: true }
}
