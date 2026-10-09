/**
 * 公开 API 的统一返回结构（对应 docs/superpowers/task6-data-contract.md）。
 *
 * 约定：
 *   - 成功：{ data, meta? }；
 *   - 失败：{ error: { code, message } }，message 为可直接展示的中文。
 */
export interface ApiError {
  code: string
  message: string
}

export interface ApiMeta {
  page?: number
  pageSize?: number
  total?: number
  totalPages?: number
}

export interface ApiResult<T> {
  data?: T
  meta?: ApiMeta
  error?: ApiError
}
