import { apiErrorMessage, httpStatusOf } from './publicApi'

/**
 * 后台内容页共用的接口小工具（纯函数，不 import `web/server/**`）。
 *
 * 只做三件事：
 *   1. 统一把接口失败翻译成可直接展示的中文消息（优先用接口返回的 error.message）；
 *   2. 提供分页与筛选参数的收敛（页码、关键字、状态）；
 *   3. 收敛 `$fetch` 的返回结构，避免页面里散落 `as` 断言。
 */

/** 后台内容列表默认每页条数（服务端默认 20、上限 48）。 */
export const ADMIN_PAGE_SIZE = 20

/** 后台列表请求允许的每页条数上限（服务端 clamps 到 48，这里保持同口径）。 */
export const ADMIN_MAX_PAGE_SIZE = 48

/**
 * 通用取数签名。
 *
 * 不能写成 `typeof $fetch` 或 `$Fetch`：`useRequestFetch()` 在 SSR 返回的是 H3Event 的 fetch
 * （类型为 `$Fetch | H3Event$Fetch`），与全局 `$fetch` 的类型并不完全一致，
 * 直接相加/赋值都会报类型不兼容。这里只声明页面真正使用的能力（路径 + 可选配置 → Promise），
 * 两种实现都能满足；返回值由调用处断言成 {@link AdminEnvelope}。
 */
export interface AdminFetchLike {
  (request: string, options?: Record<string, unknown>): Promise<unknown>
}

/** 后台接口统一响应外壳。 */
interface AdminEnvelope<T> {
  data?: T
  meta?: {
    page?: unknown
    pageSize?: unknown
    total?: unknown
    totalPages?: unknown
  }
  error?: { code?: unknown, message?: unknown }
}

/** 正整数收敛；非法值回落到 fallback。 */
export function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** 非负整数收敛；非法值回落到 0。 */
export function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * 列表分页信息。page / pageSize 用服务端夹取后的值，total / totalPages 直接取 `meta`，
 * 前端绝不自行估算总数。
 */
export interface AdminPageMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdminPageResult<T> {
  items: T[]
  meta: AdminPageMeta
}

/** 把接口 `meta` 收敛成 AdminPageMeta；缺失字段用请求参数与总数兜底。 */
export function toPageMeta(
  meta: AdminEnvelope<unknown>['meta'],
  requested: { page: number, pageSize: number },
): AdminPageMeta {
  const total = toNonNegativeInt(meta?.total, 0)
  const pageSize = toPositiveInt(meta?.pageSize, requested.pageSize)
  const totalPages = toPositiveInt(meta?.totalPages, Math.max(1, Math.ceil(total / pageSize) || 1))
  return {
    page: toPositiveInt(meta?.page, requested.page),
    pageSize,
    total,
    totalPages,
  }
}

/**
 * 单条读取接口的失败消息：优先接口返回的 error.message，其次按状态码给出中文说明。
 * 页面把它交给 ErrorState 展示，绝不回退到硬编码数据。
 */
export function adminRequestErrorMessage(error: unknown, fallback: string): string {
  const message = apiErrorMessage(error)
  if (message) return message
  const status = httpStatusOf(error)
  if (status === 401) return '登录状态已失效，请重新登录'
  if (status === 403) return '当前账号没有该操作权限'
  if (status === 404) return '数据不存在或已被归档'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  return fallback
}

/** 查询参数取值：只保留非空字符串与有限数字。 */
export type AdminQueryValue = string | number | undefined | null

/** 去掉空值，得到可直接交给 `$fetch` 的 query 对象。 */
export function toAdminQuery(input: Record<string, AdminQueryValue>): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) query[key] = trimmed
      continue
    }
    if (Number.isFinite(value)) query[key] = value
  }
  return query
}

/**
 * 调用后台接口并解包 `{ data, meta }`。
 *
 * HTTP 失败或 payload 里带 `error` 时抛中文 Error，页面用 ErrorState 展示；
 * 泛型 T 由调用方的 {@link AdminWriteResult} 声明，避免在页面里写 `as`。
 *
 * `requestFetch` 必须传 `useRequestFetch()` 的返回值：SSR 期间对 `/api/admin/**` 的相对请求
 * 需要转发用户请求头（含 HttpOnly 会话 Cookie），否则服务端拿不到登录态，
 * 已登录用户首屏会被接口判成「未登录」。客户端它等价于普通 `$fetch`。
 */
export async function requestAdminApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    query?: Record<string, AdminQueryValue>
    body?: unknown
    /** useRequestFetch() 的实例；SSR 转发 Cookie 依赖它 */
    requestFetch?: AdminFetchLike
  } = {},
): Promise<T> {
  const { method = 'GET', query, body, requestFetch } = options
  const doFetch: AdminFetchLike = requestFetch ?? $fetch
  const payload = await doFetch(path, {
    method,
    ...(query ? { query: toAdminQuery(query) } : {}),
    ...(body === undefined ? {} : { body }),
  }) as AdminEnvelope<T> | null | undefined
  const failure = payload?.error
  if (failure) {
    const message = typeof failure.message === 'string' && failure.message.trim()
      ? failure.message.trim()
      : '操作失败，请稍后重试'
    throw new Error(message)
  }
  if (payload?.data === undefined || payload?.data === null) {
    throw new Error('接口未返回数据，请稍后重试')
  }
  return payload.data
}

/** 写操作（POST / PUT / DELETE）解包后可直接取用的字段。 */
export interface AdminWriteResult {
  id?: number
  slug?: string
}

/** 时间文本 → datetime-local 输入框需要的 `YYYY-MM-DDTHH:mm`；无法识别时返回空串。 */
export function toDateTimeLocal(value: string | null | undefined): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(text)
  return match ? `${match[1]}T${match[2]}` : ''
}

/** 日期文本 → date 输入框需要的 `YYYY-MM-DD`；无法识别时返回空串。 */
export function toDateValue(value: string | null | undefined): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  return match ? match[1] as string : ''
}

/** 案件号形态：`NN-cv-NNNN`（与 web/server 的 CASE_NUMBER_PATTERN 同口径，大小写不敏感）。 */
export const CASE_NUMBER_PATTERN = /^\d{2}-[a-z]{2}-\d+$/i

/** 案件号提示文案。 */
export const CASE_NUMBER_HINT = '格式：两位年份-两位类型-序号，例如 24-cv-0006'

/** 案件号是否合法。 */
export function isValidCaseNumber(value: unknown): boolean {
  return typeof value === 'string' && CASE_NUMBER_PATTERN.test(value.trim())
}
