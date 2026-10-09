// 案件仓储：页面只通过这里取案件数据，不直接 $fetch 接口，也不再 import Mock 数据。
//
// 接口失败时抛出带中文消息的 Error（由页面展示错误状态），绝不回退 Mock。
import type { CaseType, CaseRecord } from '../types/content'
import {
  PublicApiError,
  isNotFoundError,
  positiveInt,
  requestPublicApi,
  unwrapPublicApiData,
} from '../utils/publicApi'

export interface CaseQuery {
  /** 案件号 / 原告 / 品牌 / 律所 */
  keyword?: string
  /** 侵权类型 */
  caseType?: CaseType
  /** 起诉州；数据库无对应列，接口接受但不会生效 */
  state?: string
  /** 起诉时间起（YYYY-MM-DD） */
  from?: string
  /** 起诉时间止（YYYY-MM-DD） */
  to?: string
  page?: number
  pageSize?: number
}

export interface CasePage {
  items: CaseRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const CASES_ENDPOINT = '/api/public/cases'
const LIST_FAILURE_MESSAGE = '案件列表加载失败，请稍后重试'
const DETAIL_FAILURE_MESSAGE = '案件详情加载失败，请稍后重试'
/** 与契约一致：列表默认每页 12 条。 */
const DEFAULT_PAGE_SIZE = 12

/** 只保留有效参数，避免把空串塞进查询串。 */
function toQueryParams(query: CaseQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const keyword = query.keyword?.trim()
  if (keyword) params.keyword = keyword
  if (query.caseType) params.caseType = query.caseType
  const state = query.state?.trim()
  if (state) params.state = state
  if (query.from) params.from = query.from
  if (query.to) params.to = query.to
  if (typeof query.page === 'number') params.page = query.page
  if (typeof query.pageSize === 'number') params.pageSize = query.pageSize
  return params
}

/** 案件列表（服务端已完成分页夹取）。 */
export async function fetchCases(query: CaseQuery = {}): Promise<CasePage> {
  const payload = await requestPublicApi<CaseRecord[]>(CASES_ENDPOINT, toQueryParams(query))
  const items = unwrapPublicApiData(payload, LIST_FAILURE_MESSAGE)
  if (!Array.isArray(items)) {
    throw new PublicApiError('案件列表数据格式异常，请稍后重试', 0, 'INVALID_RESPONSE')
  }

  const meta = payload.meta ?? {}
  const total = positiveInt(meta.total, items.length)
  const pageSize = positiveInt(meta.pageSize, DEFAULT_PAGE_SIZE)
  const page = positiveInt(meta.page, 1)
  const totalPages = positiveInt(meta.totalPages, total > 0 ? Math.ceil(total / pageSize) : 1)

  return { items, total, page, pageSize, totalPages }
}

/** 案件详情；未找到或未发布返回 null，其余失败抛出中文错误。 */
export async function fetchCaseDetail(slug: string): Promise<CaseRecord | null> {
  const path = `${CASES_ENDPOINT}/${encodeURIComponent(slug)}`
  try {
    const payload = await requestPublicApi<CaseRecord>(path)
    const record = unwrapPublicApiData(payload, DETAIL_FAILURE_MESSAGE)
    return record ?? null
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error instanceof Error ? error : new Error(DETAIL_FAILURE_MESSAGE)
  }
}
