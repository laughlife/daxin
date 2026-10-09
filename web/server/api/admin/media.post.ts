// POST /api/admin/media
//
// 浏览器直传 OSS 成功后，由本接口登记媒体记录。
// 约定：
//   - 先校验管理员登录态与 media:write 权限；
//   - 服务端重新校验入参（绝不信任客户端自报的文件名/大小/类型）；
//   - 登记前对公开地址发 HEAD 校验对象确实存在且大小/类型一致，网络异常一律不落库；
//   - 使用 INSERT ... ON DUPLICATE KEY UPDATE，重试登记不会产生重复行。
import type { H3Event } from 'h3'
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { writeAuditLog } from '../../utils/auth/audit'
import { queryTarget } from '../../utils/db/query'
import { getOssConfig, isOssConfigured, type OssConfig } from '../../utils/oss/config'
import { buildPublicUrl, validateMediaRegistration } from '../../utils/oss/validation'

const MAX_FILE_NAME_LENGTH = 255
const MAX_TITLE_LENGTH = 255
const MAX_MIME_LENGTH = 128
const MAX_SCOPE_LENGTH = 32
const MAX_OBJECT_KEY_LENGTH = 512
const MAX_DIMENSION = 65535
/** HEAD 校验超时：5 秒，避免上游卡顿拖垮后台请求。 */
const HEAD_TIMEOUT_MS = 5000
const OSS_NOT_CONFIGURED = {
  code: 'OSS_NOT_CONFIGURED',
  message: '对象存储未配置：请在 web/.env 中配置 ALIYUN_OSS_* 相关变量后重启服务',
}

type MediaRegistrationRequest = {
  objectKey: string
  byteSize: number
  mimeType: string
  fileName: string
  usageScope: string
  title: string
  width: number | null
  height: number | null
}

type MediaRow = {
  id: number | string | null
  object_key: string | null
  public_url: string | null
  mime_type: string | null
  byte_size: number | string | null
  usage_scope: string | null
  title: string | null
  created_at: Date | string | null
}

type VerifyResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string }

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): { error: { code: string; message: string } } {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少媒体写入权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function toPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_DIMENSION) return null
  return parsed
}

/** 未提供 fileName 时退回对象键的文件名部分，便于后台列表展示。 */
function fileNameFromObjectKey(objectKey: string): string {
  const segments = objectKey.split('/')
  return (segments[segments.length - 1] ?? '').trim()
}

async function readMediaBody(event: H3Event): Promise<MediaRegistrationRequest | null> {
  let body: unknown = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  const objectKey = typeof record.objectKey === 'string' ? record.objectKey.trim() : ''
  const rawSize = record.byteSize
  const byteSize = typeof rawSize === 'number' ? rawSize : Number(rawSize)
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim().toLowerCase() : ''
  const rawFileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  const rawScope = typeof record.usageScope === 'string' ? record.usageScope.trim() : ''
  const rawTitle = typeof record.title === 'string' ? record.title.trim() : ''

  if (!objectKey || objectKey.length > MAX_OBJECT_KEY_LENGTH) return null
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) return null
  if (!mimeType || mimeType.length > MAX_MIME_LENGTH) return null

  const usageScope = rawScope || 'general'
  if (usageScope.length > MAX_SCOPE_LENGTH) return null

  const fileName = rawFileName || fileNameFromObjectKey(objectKey)
  if (fileName.length > MAX_FILE_NAME_LENGTH) return null

  const title = rawTitle.slice(0, MAX_TITLE_LENGTH)

  return {
    objectKey,
    byteSize,
    mimeType,
    fileName,
    usageScope,
    title,
    width: toPositiveInteger(record.width),
    height: toPositiveInteger(record.height),
  }
}

/** 去掉 content-type 的 charset 等参数并统一小写。 */
function normalizeMimeType(value: string | null): string {
  return (value ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * 判断 OSS 返回的 content-type 是否与提交的 MIME 兼容。
 * 仅当 OSS 未能识别文件类型（application/octet-stream）时放宽，
 * 其余情况要求完全一致，避免用错误类型登记记录。
 */
function isMimeTypeCompatible(submitted: string, actual: string): boolean {
  if (!submitted || !actual) return true
  if (submitted === actual) return true
  return actual === 'application/octet-stream' || submitted === 'application/octet-stream'
}

/** 对公开地址发 HEAD 校验对象真实存在且元数据一致。 */
async function verifyUploadedObject(publicUrl: string, byteSize: number, mimeType: string): Promise<VerifyResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(publicUrl, { method: 'HEAD', signal: controller.signal, redirect: 'follow' })
  } catch {
    return { ok: false, status: 502, code: 'OSS_UNREACHABLE', message: '无法访问对象存储校验上传结果，请稍后重试' }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 404 || response.status === 403) {
    return { ok: false, status: 400, code: 'OBJECT_NOT_FOUND', message: '对象不存在或不可访问' }
  }
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      code: 'OSS_VERIFY_FAILED',
      message: `对象存储校验失败（HTTP ${response.status}），请稍后重试`,
    }
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength) {
    const actualSize = Number.parseInt(contentLength, 10)
    if (Number.isFinite(actualSize) && actualSize !== byteSize) {
      return { ok: false, status: 400, code: 'SIZE_MISMATCH', message: '文件大小与上传结果不一致' }
    }
  }

  const contentType = normalizeMimeType(response.headers.get('content-type'))
  if (contentType && !isMimeTypeCompatible(mimeType, contentType)) {
    return { ok: false, status: 400, code: 'MIME_MISMATCH', message: '文件类型与上传结果不一致' }
  }

  return { ok: true }
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'media:write')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const request = await readMediaBody(event)
  if (!request) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_INPUT', message: '媒体登记参数不完整或格式不正确' } }
  }

  if (!isOssConfigured()) {
    setResponseStatus(event, 503)
    return { error: OSS_NOT_CONFIGURED }
  }

  let config: OssConfig
  try {
    config = getOssConfig()
  } catch {
    setResponseStatus(event, 503)
    return { error: OSS_NOT_CONFIGURED }
  }

  const mediaInput = {
    objectKey: request.objectKey,
    fileName: request.fileName,
    byteSize: request.byteSize,
    mimeType: request.mimeType,
    usageScope: request.usageScope,
  }
  const validation = validateMediaRegistration(mediaInput, config)
  if (!validation.ok) {
    setResponseStatus(event, 400)
    return { error: { code: validation.error.code, message: validation.error.message } }
  }

  const publicUrl = buildPublicUrl(config, request.objectKey)
  const verified = await verifyUploadedObject(publicUrl, request.byteSize, request.mimeType)
  if (!verified.ok) {
    setResponseStatus(event, verified.status)
    return { error: { code: verified.code, message: verified.message } }
  }

  try {
    await queryTarget(
      `INSERT INTO media_assets
         (object_key, public_url, file_name, mime_type, byte_size, width, height, usage_scope, title, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         public_url = VALUES(public_url),
         file_name = VALUES(file_name),
         mime_type = VALUES(mime_type),
         byte_size = VALUES(byte_size),
         width = VALUES(width),
         height = VALUES(height),
         usage_scope = VALUES(usage_scope),
         title = VALUES(title),
         uploaded_by = VALUES(uploaded_by),
         deleted_at = NULL,
         updated_at = NOW()`,
      [
        request.objectKey,
        publicUrl,
        request.fileName,
        request.mimeType,
        request.byteSize,
        request.width,
        request.height,
        request.usageScope,
        request.title,
        admin.id,
      ],
    )
  } catch (error) {
    console.error('[admin-media] 写入媒体记录失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'MEDIA_WRITE_FAILED', message: '保存媒体记录失败，请稍后重试' } }
  }

  let rows: MediaRow[]
  try {
    rows = await queryTarget<MediaRow>(
      `SELECT id, object_key, public_url, mime_type, byte_size, usage_scope, title, created_at
         FROM media_assets WHERE object_key = ? LIMIT 1`,
      [request.objectKey],
    )
  } catch (error) {
    console.error('[admin-media] 读取媒体记录失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'MEDIA_READ_FAILED', message: '媒体记录写入后读取失败，请稍后重试' } }
  }
  const row = rows[0]
  if (!row) {
    setResponseStatus(event, 500)
    return { error: { code: 'MEDIA_READ_FAILED', message: '媒体记录写入后读取失败，请稍后重试' } }
  }

  const media = {
    id: Number(row.id ?? 0),
    objectKey: String(row.object_key ?? request.objectKey),
    publicUrl: String(row.public_url ?? publicUrl),
    mimeType: String(row.mime_type ?? request.mimeType),
    byteSize: Number(row.byte_size ?? request.byteSize),
    usageScope: String(row.usage_scope ?? request.usageScope),
    title: String(row.title ?? ''),
    createdAt: toIsoString(row.created_at),
  }

  try {
    await writeAuditLog({
      userId: admin.id,
      username: admin.username,
      action: 'media_register',
      entityType: 'media',
      entityId: media.id,
      ipDigest: getIpDigest(event),
      note: `登记媒体：usageScope=${media.usageScope}，byteSize=${media.byteSize}`,
    })
  } catch (error) {
    // 审计写入失败不影响登记结果。
    console.error('[admin-media] 写入审计日志失败', error)
  }

  return { data: { media } }
})
