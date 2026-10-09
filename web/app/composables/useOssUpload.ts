import { onScopeDispose, ref } from 'vue'

/**
 * 后台媒体上传（浏览器直传阿里云 OSS）。
 *
 * 流程：
 * 1. 客户端先做基础校验（空文件、超出服务端返回的 maxBytes 上限），避免无谓请求；
 * 2. POST /api/admin/upload-policy 取得一次性上传凭证（policy / signature / accessKeyId）；
 * 3. 用 XMLHttpRequest 以 multipart/form-data 直传 OSS —— 只有 XHR 能提供
 *    upload.onprogress，从而驱动进度条（fetch 无法读取上传进度）；
 * 4. 浏览器端读取图片宽高（createImageBitmap / Image 降级），随元数据一并上报；
 * 5. POST /api/admin/media 登记媒体记录，返回 MediaAsset。
 *
 * 安全说明：AccessKey Secret 永远不下发到浏览器，服务端只用它计算签名；
 * 前端仅拿到 accessKeyId、policy、signature 三个字段，即使泄漏也只能在
 * 该 policy 允许的 key / 大小 / 时间窗口内上传单个对象。
 */

/** 媒体资源（对应 POST /api/admin/media 的 data.media） */
export interface MediaAsset {
  id: number
  objectKey: string
  publicUrl: string
  mimeType: string
  byteSize: number
  usageScope: string
  title: string
  createdAt: string
}

/** 上传过程中的可展示错误 */
export interface UploadError {
  code: string
  message: string
}

/** 服务端下发的上传凭证（对应 POST /api/admin/upload-policy 的 data） */
export interface UploadPolicy {
  host: string
  key: string
  policy: string
  signature: string
  /** 注意：表单字段名是 OSSAccessKeyId，JSON 属性名是 accessKeyId */
  accessKeyId: string
  /** 过期时刻，毫秒时间戳 */
  expireAt: number
  maxBytes: number
  allowedMimeTypes: string[]
  publicUrl: string
}

/** upload() 的可选参数 */
export interface UploadOptions {
  usageScope?: string
  title?: string
  /** 拿到上传凭证后的回调（已通过完整性校验），供页面读取服务端白名单等元信息 */
  onPolicy?: (policy: UploadPolicy) => void
}

/** 图片宽高（读不出来时为 undefined） */
interface ImageSize {
  width?: number
  height?: number
}

/** 默认的大小上限（仅在服务端未返回 maxBytes 时兜底） */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

/** 判断是否为已成型的上传错误 */
function isUploadError(error: unknown): error is UploadError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

/** 带 statusCode 的 $fetch 错误 */
function isFetchError(error: unknown): error is { statusCode: number, data?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  )
}

/** 把任意值收敛成字符串 */
function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * 从错误响应体里取出 { error: { code, message } }。
 * 兼容三种形态：已解析的对象、JSON 字符串、纯文本（部分 OSS 错误为 XML）。
 */
function parseServerError(payload: unknown): UploadError | null {
  let body: unknown = payload
  if (typeof body === 'string') {
    const text = body.trim()
    if (!text) return null
    try {
      body = JSON.parse(text)
    } catch {
      return { code: '', message: text.slice(0, 300) }
    }
  }
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const raw = record.error
  if (typeof raw === 'object' && raw !== null) {
    const detail = raw as Record<string, unknown>
    return { code: toText(detail.code), message: toText(detail.message) }
  }
  // 少数接口可能直接返回 { code, message }
  if ('code' in record || 'message' in record) {
    return { code: toText(record.code), message: toText(record.message) }
  }
  return null
}

/** 按错误码 / HTTP 状态码映射中文提示（错误码与 web/server/api/admin/** 对齐） */
function mapToChineseMessage(code: string, message: string, status?: number): string {
  switch (code) {
    case 'OSS_NOT_CONFIGURED':
    case 'OSS_DISABLED':
      return '对象存储（OSS）未配置，无法上传文件，请联系管理员补全 ALIYUN_OSS_* 配置后重试'
    case 'INVALID_INPUT':
    case 'INVALID_REQUEST':
    case 'VALIDATION_ERROR':
      return '上传参数不完整或格式不正确，请重新选择文件后再试'
    case 'FILE_TOO_LARGE':
      return message || '文件超出大小限制，请压缩后再上传'
    case 'UNSUPPORTED_MIME_TYPE':
      return message || '不支持该文件类型：仅支持 JPG / PNG / WebP / GIF 图片，文章用途额外支持 PDF'
    case 'UNAUTHORIZED':
      return '登录状态已失效，请重新登录后再上传'
    case 'FORBIDDEN':
      return '当前账号缺少媒体上传权限，请联系管理员'
    case 'OBJECT_NOT_FOUND':
      return message || '文件未成功上传到对象存储，请重试'
    case 'SIZE_MISMATCH':
      return message || '文件大小与上传结果不一致，请重新上传'
    case 'MIME_MISMATCH':
      return message || '文件类型与上传结果不一致，请重新上传'
    case 'OSS_UNREACHABLE':
    case 'OSS_VERIFY_FAILED':
      return message || '无法访问对象存储校验上传结果，请稍后重试'
    case 'OSS_UPLOAD_FAILED':
    case 'MEDIA_WRITE_FAILED':
    case 'MEDIA_REGISTER_FAILED':
    case 'POLICY_FAILED':
      return message || '服务器保存媒体记录失败，请稍后重试'
    default:
      break
  }
  if (status === 503) {
    return '对象存储（OSS）未配置，无法上传文件，请联系管理员补全 ALIYUN_OSS_* 配置后重试'
  }
  if (status === 401) return '登录状态已失效，请重新登录后再上传'
  if (status === 403) return '当前账号缺少媒体上传权限，请联系管理员'
  if (status === 400) return message || '上传参数不完整或格式不正确，请重新选择文件后再试'
  if (status === 502) return message || '对象存储服务暂时不可用，请稍后重试'
  if (typeof status === 'number' && status >= 500) {
    return message || '服务器暂时不可用，请稍后重试'
  }
  return message || '上传失败，请稍后重试'
}

/** 由捕获到的异常构造中文上传错误 */
function toUploadError(error: unknown, fallback: string): UploadError {
  if (isUploadError(error)) return error
  if (isFetchError(error)) {
    const parsed = parseServerError(error.data)
    return {
      code: parsed?.code || `HTTP_${error.statusCode}`,
      message: mapToChineseMessage(parsed?.code ?? '', parsed?.message ?? '', error.statusCode)
    }
  }
  if (error instanceof Error && error.message) {
    return { code: 'CLIENT_ERROR', message: error.message }
  }
  return { code: 'NETWORK_ERROR', message: fallback }
}

/** 读取图片宽高；非图片或读取失败时返回空对象 */
async function readImageSize(file: File): Promise<ImageSize> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return {}
  try {
    if (typeof window.createImageBitmap === 'function') {
      const bitmap = await window.createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close?.()
      return size
    }
  } catch {
    // 落到 Image 元素方案
  }
  try {
    const url = URL.createObjectURL(file)
    try {
      return await new Promise<ImageSize>((resolve) => {
        const image = new Image()
        image.onload = () => resolve({
          width: image.naturalWidth || undefined,
          height: image.naturalHeight || undefined
        })
        image.onerror = () => resolve({})
        image.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return {}
  }
}

/**
 * 直传 OSS。
 * 表单字段全部来自服务端签名：key / policy / signature / OSSAccessKeyId，
 * 并显式指定 success_action_status=200 让 OSS 返回 200 而不是 204 重定向语义。
 */
function postToOss(
  file: File,
  policy: UploadPolicy,
  onProgress: (percent: number) => void,
  onAbortReady: (abort: () => void) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData()
    form.append('key', policy.key)
    form.append('policy', policy.policy)
    form.append('signature', policy.signature)
    // JSON 里叫 accessKeyId，OSS 表单字段必须叫 OSSAccessKeyId
    form.append('OSSAccessKeyId', policy.accessKeyId)
    form.append('success_action_status', '200')
    form.append('file', file, file.name)

    const xhr = new XMLHttpRequest()
    onAbortReady(() => xhr.abort())

    xhr.open('POST', policy.host, true)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100)
        onProgress(Math.min(100, Math.max(0, percent)))
      }
    }
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
        onProgress(100)
        resolve()
        return
      }
      const detail = parseServerError(xhr.responseText)
      reject({
        code: detail?.code || `OSS_HTTP_${xhr.status}`,
        message: `对象存储上传失败（HTTP ${xhr.status}）${detail?.message ? `：${detail.message}` : ''}`
      } satisfies UploadError)
    }
    xhr.onerror = () => {
      reject({
        code: 'OSS_NETWORK_ERROR',
        message: '直传对象存储时网络中断，请检查网络后重试'
      } satisfies UploadError)
    }
    xhr.onabort = () => {
      reject({ code: 'UPLOAD_ABORTED', message: '上传已取消' } satisfies UploadError)
    }
    xhr.ontimeout = () => {
      reject({ code: 'OSS_TIMEOUT', message: '对象存储上传超时，请稍后重试' } satisfies UploadError)
    }
    xhr.send(form)
  })
}

export function useOssUpload() {
  /**
   * 接口调用必须使用 useRequestFetch：SSR 期间对 /api/admin/** 的相对请求
   * 需要转发用户请求头（含 HttpOnly 会话 Cookie），否则服务端拿不到登录态，
   * 会误报未登录；客户端它等价于普通 $fetch。
   */
  const requestFetch = useRequestFetch()

  /** 是否正在上传 */
  const uploading = ref(false)
  /** 上传进度 0-100 */
  const progress = ref(0)
  /** 最近一次错误 */
  const error = ref<UploadError | null>(null)
  /** 当前 XHR 的中止句柄（仅客户端存在） */
  let abortCurrent: (() => void) | null = null

  /** 清空进度与错误 */
  function reset() {
    progress.value = 0
    error.value = null
  }

  /** 取消进行中的直传（页面卸载或用户主动取消） */
  function abort() {
    if (abortCurrent) {
      const run = abortCurrent
      abortCurrent = null
      run()
    }
  }

  // 组件卸载时中止未完成的直传，避免回调落在已销毁的组件上
  onScopeDispose(() => {
    abort()
  })

  /** 第一步：申请上传凭证 */
  async function requestPolicy(file: File, options: UploadOptions): Promise<UploadPolicy> {
    const response = await requestFetch<{ data: UploadPolicy }>('/api/admin/upload-policy', {
      method: 'POST',
      body: {
        fileName: file.name,
        byteSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        ...(options.usageScope ? { usageScope: options.usageScope } : {})
      }
    })
    const policy = response?.data
    if (!policy?.host || !policy?.key || !policy?.signature || !policy?.policy) {
      throw {
        code: 'INVALID_POLICY',
        message: '服务端返回的上传凭证不完整，请稍后重试'
      } satisfies UploadError
    }
    return policy
  }

  /** 第二步：直传 OSS（返回时文件已在 OSS 上） */
  async function uploadToOss(file: File, policy: UploadPolicy): Promise<void> {
    if (typeof XMLHttpRequest === 'undefined') {
      throw {
        code: 'UNSUPPORTED_BROWSER',
        message: '当前浏览器不支持直传对象存储，请更换现代浏览器后重试'
      } satisfies UploadError
    }
    abortCurrent = null
    await postToOss(file, policy, (percent) => {
      progress.value = percent
    }, (run) => {
      abortCurrent = run
    })
    abortCurrent = null
  }

  /** 第三步：登记媒体记录 */
  async function registerMedia(
    file: File,
    policy: UploadPolicy,
    options: UploadOptions,
    size: ImageSize
  ): Promise<MediaAsset> {
    const response = await requestFetch<{ data: { media: MediaAsset } }>('/api/admin/media', {
      method: 'POST',
      body: {
        objectKey: policy.key,
        byteSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        ...(options.usageScope ? { usageScope: options.usageScope } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(size.width && size.height ? { width: size.width, height: size.height } : {})
      }
    })
    const media = response?.data?.media
    if (!media?.id) {
      throw {
        code: 'INVALID_MEDIA_RESPONSE',
        message: '服务端未返回媒体记录，请稍后重试'
      } satisfies UploadError
    }
    return media
  }

  /**
   * 完整上传流程。
   * @throws UploadError 失败时抛出（同时写入 error 状态）
   */
  async function upload(file: File, options: UploadOptions = {}): Promise<MediaAsset> {
    reset()

    // 1. 客户端先行校验：空文件无需任何网络请求
    if (!file || file.size <= 0) {
      const failure: UploadError = { code: 'EMPTY_FILE', message: '请选择非空文件后再上传' }
      error.value = failure
      throw failure
    }

    uploading.value = true
    try {
      const policy = await requestPolicy(file, options)
      options.onPolicy?.(policy)

      // 2. 取得 maxBytes 后立刻校验大小，避免把注定失败的文件传上去
      const maxBytes = policy.maxBytes > 0 ? policy.maxBytes : DEFAULT_MAX_BYTES
      if (file.size > maxBytes) {
        throw {
          code: 'FILE_TOO_LARGE',
          message: `文件大小超出限制（最大 ${formatBytes(maxBytes)}，当前 ${formatBytes(file.size)}）`
        } satisfies UploadError
      }

      // 3. 直传 OSS（进度由 xhr.upload.onprogress 驱动）
      await uploadToOss(file, policy)

      // 4. 读取图片宽高（可选，失败不影响上传结果）
      const size = await readImageSize(file)

      // 5. 登记媒体记录
      return await registerMedia(file, policy, options, size)
    } catch (cause) {
      const failure = toUploadError(cause, '上传失败，请检查网络后重试')
      error.value = failure
      throw failure
    } finally {
      uploading.value = false
    }
  }

  return { upload, uploading, progress, error, reset, abort }
}

/** 把字节数格式化为便于阅读的中文文案 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
