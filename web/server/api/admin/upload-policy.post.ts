// POST /api/admin/upload-policy
//
// 为浏览器直传 OSS 生成 PostObject 表单策略。
// 约定：
//   - 先校验管理员登录态与 media:write 权限；
//   - OSS 未配置时返回 503，提示运维在 web/.env 补全 ALIYUN_OSS_*，不回显任何配置值；
//   - 响应只保留前端直传必需的可公开字段，构造后再断言其中不含 AccessKeySecret；
//   - 每次下发策略都写一条审计日志。
import type { H3Event } from 'h3'
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { writeAuditLog } from '../../utils/auth/audit'
import { getOssConfig, isOssConfigured, type OssConfig } from '../../utils/oss/config'
import { buildObjectKey, createPostObjectPolicy, type UploadPolicy } from '../../utils/oss/policy'
import { validateUploadRequest } from '../../utils/oss/validation'

const MAX_FILE_NAME_LENGTH = 255
const MAX_MIME_LENGTH = 128
const MAX_SCOPE_LENGTH = 32
/** 未配置 OSS 时的统一提示：只说明要配置哪一族变量，不涉及具体值。 */
const OSS_NOT_CONFIGURED = {
  code: 'OSS_NOT_CONFIGURED',
  message: '对象存储未配置：请在 web/.env 中配置 ALIYUN_OSS_* 相关变量后重启服务',
}

type UploadPolicyRequest = {
  fileName: string
  byteSize: number
  mimeType: string
  usageScope: string
}

/** 文件扩展名无法从文件名推断时，按常见 MIME 兜底。 */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
})

/**
 * 允许出现在对象键里的扩展名：与 validation.ts 的 OBJECT_KEY_PATTERN 保持一致。
 * 文件名带的扩展名若不在其中（如 .jfif、.svg），一律改用 MIME 推断的结果，
 * 避免签发一个后续无法登记的对象键。
 */
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'])

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): { error: { code: string; message: string } } {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少媒体上传权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

/** 读取并规范化请求体；任何字段不合法都返回 null，由调用方统一回 400。 */
async function readUploadPolicyBody(event: H3Event): Promise<UploadPolicyRequest | null> {
  let body: unknown = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  const rawSize = record.byteSize
  const byteSize = typeof rawSize === 'number' ? rawSize : Number(rawSize)
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim().toLowerCase() : ''
  const rawScope = typeof record.usageScope === 'string' ? record.usageScope.trim() : ''
  const usageScope = rawScope || 'general'

  if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH) return null
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) return null
  if (!mimeType || mimeType.length > MAX_MIME_LENGTH) return null
  if (usageScope.length > MAX_SCOPE_LENGTH) return null

  return { fileName, byteSize, mimeType, usageScope }
}

/** 从文件名取扩展名；取不到时按 MIME 推断，最后退回 MIME 子类型。 */
function resolveExtension(fileName: string, mimeType: string): string {
  const fromName = /\.([A-Za-z0-9]{1,10})$/.exec(fileName)?.[1]?.toLowerCase() ?? ''
  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) return fromName

  const mapped = EXTENSION_BY_MIME[mimeType]
  if (mapped) return mapped

  const subtype = (mimeType.split('/')[1] ?? '').replace(/[^a-z0-9]/g, '')
  return subtype.slice(0, 10) || 'bin'
}

/**
 * 只构造可公开下发的字段（而不是直接透传策略对象），
 * 并在返回前断言序列化结果中不含 AccessKeySecret。
 */
function toPublicPolicy(policy: UploadPolicy, accessKeySecret: string): UploadPolicy {
  const safe: UploadPolicy = {
    host: policy.host,
    key: policy.key,
    policy: policy.policy,
    signature: policy.signature,
    accessKeyId: policy.accessKeyId,
    expireAt: policy.expireAt,
    maxBytes: policy.maxBytes,
    allowedMimeTypes: policy.allowedMimeTypes,
    publicUrl: policy.publicUrl,
  }

  const serialized = JSON.stringify(safe)
  const secret = String(accessKeySecret ?? '')
  if (secret && serialized.includes(secret)) {
    throw new Error('上传策略序列化结果包含 AccessKeySecret')
  }
  for (const key of Object.keys(safe)) {
    if (key === 'accessKeyId') continue
    if (/secret|credential|password|token/i.test(key)) {
      throw new Error(`上传策略包含敏感字段 ${key}`)
    }
  }
  return safe
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'media:write')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const request = await readUploadPolicyBody(event)
  if (!request) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_INPUT', message: '上传参数不完整或格式不正确' } }
  }

  if (!isOssConfigured()) {
    setResponseStatus(event, 503)
    return { error: OSS_NOT_CONFIGURED }
  }

  let config: OssConfig
  try {
    config = getOssConfig()
  } catch {
    // getOssConfig 的报错会点名缺失变量；这里只回统一提示，不附带任何配置值。
    setResponseStatus(event, 503)
    return { error: OSS_NOT_CONFIGURED }
  }

  const objectKey = buildObjectKey({
    date: new Date(),
    uuid: crypto.randomUUID(),
    extension: resolveExtension(request.fileName, request.mimeType),
  })

  const uploadRequest = {
    fileName: request.fileName,
    byteSize: request.byteSize,
    mimeType: request.mimeType,
    usageScope: request.usageScope,
    objectKey,
  }
  const validation = validateUploadRequest(uploadRequest, config)
  if (!validation.ok) {
    setResponseStatus(event, 400)
    return { error: { code: validation.error.code, message: validation.error.message } }
  }

  let data: UploadPolicy
  try {
    data = toPublicPolicy(
      // 把校验通过的 MIME 固化进签名策略：提交时 Content-Type 必须与签发值完全一致，
      // 否则 OSS 直接拒绝。防止拿合法策略改写表单类型上传 text/html 等非白名单对象。
      createPostObjectPolicy({
        config,
        objectKey,
        usageScope: request.usageScope,
        mimeType: request.mimeType,
      }),
      config.accessKeySecret,
    )
  } catch (error) {
    console.error('[admin-upload-policy] 生成上传策略失败', error instanceof Error ? error.message : error)
    setResponseStatus(event, 500)
    return { error: { code: 'POLICY_FAILED', message: '生成上传策略失败，请稍后重试' } }
  }

  try {
    await writeAuditLog({
      userId: admin.id,
      username: admin.username,
      action: 'upload_policy',
      entityType: 'media',
      ipDigest: getIpDigest(event),
      note: `下发上传策略：usageScope=${request.usageScope}，byteSize=${request.byteSize}`,
    })
  } catch (error) {
    // 审计写入失败不影响本次策略下发。
    console.error('[admin-upload-policy] 写入审计日志失败', error)
  }

  return { data }
})
