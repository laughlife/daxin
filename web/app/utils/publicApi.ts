import type { ApiResult } from '../types/api'

/**
 * 公开接口取数工具：统一 $fetch 调用、错误消息与响应校验。
 *
 * 为什么用全局 $fetch 而不是 useRequestFetch：
 * 这几个接口都是无需登录的公开 GET，不依赖 Cookie 与鉴权请求头。Nuxt 在 SSR 阶段会把相对
 * 路径的 $fetch 直接分发到内部 Nitro 路由，客户端也走同一份代码，因此 $fetch 更简单；
 * useRequestFetch 只在需要转发请求上下文（Cookie / 鉴权头 / 原始 IP）时才必要。
 *
 * 失败时一律抛出带中文消息的 Error，绝不回退到 Mock 数据；页面据此展示错误状态。
 */
export class PublicApiError extends Error {
  /** HTTP 状态码；payload 层错误时为 0。 */
  readonly status: number
  /** 接口约定的错误码，如 NOT_FOUND。 */
  readonly code: string

  constructor(message: string, status = 0, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'PublicApiError'
    this.status = status
    this.code = code
  }
}

function toStatus(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : 0
}

/** 从 ofetch 抛出的异常里取出 HTTP 状态码，取不到返回 0。 */
export function httpStatusOf(error: unknown): number {
  const source = (error ?? null) as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null
  return toStatus(source?.status) || toStatus(source?.statusCode) || toStatus(source?.response?.status)
}

/** 从错误响应体 { error: { code, message } } 中取出中文消息，取不到返回空串。 */
export function apiErrorMessage(error: unknown): string {
  const data = ((error ?? null) as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return ''
  const detail = (data as { error?: unknown }).error
  if (!detail || typeof detail !== 'object') return ''
  const message = (detail as { message?: unknown }).message
  return typeof message === 'string' ? message.trim() : ''
}

/** 从错误响应体中取出错误码，取不到返回空串。 */
export function apiErrorCode(error: unknown): string {
  const data = ((error ?? null) as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return ''
  const detail = (data as { error?: unknown }).error
  if (!detail || typeof detail !== 'object') return ''
  const code = (detail as { code?: unknown }).code
  return typeof code === 'string' ? code.trim() : ''
}

/** 发起公开接口 GET 请求；HTTP 失败时抛出 PublicApiError（中文消息）。 */
export async function requestPublicApi<T>(
  path: string,
  query?: Record<string, string | number>,
): Promise<ApiResult<T>> {
  try {
    return await $fetch<ApiResult<T>>(path, query ? { query } : {})
  } catch (error) {
    const status = httpStatusOf(error)
    const code = apiErrorCode(error) || (status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED')
    throw new PublicApiError(apiErrorMessage(error) || '数据加载失败，请稍后重试', status, code)
  }
}

/** 取出 data；payload 层返回 error 或缺少 data 时按失败处理。 */
export function unwrapPublicApiData<T>(payload: ApiResult<T>, fallbackMessage: string): T {
  if (payload.error) {
    throw new PublicApiError(payload.error.message || fallbackMessage, 0, payload.error.code || 'API_ERROR')
  }
  if (payload.data === undefined || payload.data === null) {
    throw new PublicApiError(fallbackMessage, 0, 'EMPTY_RESPONSE')
  }
  return payload.data
}

/** 判断错误是否表示资源不存在（HTTP 404 或 NOT_FOUND 错误码）。 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof PublicApiError) return error.status === 404 || error.code === 'NOT_FOUND'
  return httpStatusOf(error) === 404
}

/** 把接口 meta 中的数值字段收敛为正整数。 */
export function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
}
