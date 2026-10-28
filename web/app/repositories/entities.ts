// 品牌 / 律所仓储：页面只通过这里取实体数据，不直接 $fetch 接口。
//
// 接口失败时抛出带中文消息的 Error（由页面展示错误状态），绝不回退 Mock。
import type { CaseRecord, CaseType } from '../types/content'
import {
  isNotFoundError,
  requestPublicApi,
  unwrapPublicApiData,
} from '../utils/publicApi'

export interface BrandSummary {
  /** 品牌分类：专利 / 版权 / 商标 */
  ipCategory?: string
  /** 品牌方 */
  brandOwner?: string
  slug: string
  name: string
  description: string
  caseCount: number
  logoUrl?: string
  plaintiff?: string
  lawFirm?: string
  stateCode?: string
  caseTypes?: CaseType[]
}

export interface BrandDirectoryQuery {
  keyword?: string
  caseType?: CaseType
  page?: number
  pageSize?: number
}

export interface BrandDirectoryStats {
  total: number
  trademark: number
  patent: number
  copyright: number
}

export interface BrandDirectoryPage {
  items: BrandSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  stats: BrandDirectoryStats
}

export interface FirmSummary {
  slug: string
  name: string
  description: string
  caseCount: number
  /** 简称（law_firms.short_name），可能为空串。 */
  shortName?: string
  /** 地址（law_firms.address）。 */
  address?: string
  /** 官网（law_firms.website），只有 http(s) 链接才应渲染成可点击链接。 */
  website?: string
}

export interface BrandDetail {
  brand: BrandSummary
  cases: CaseRecord[]
}

export interface FirmDetail {
  firm: FirmSummary
  cases: CaseRecord[]
}

const BRANDS_ENDPOINT = '/api/public/brands'
const LAW_FIRMS_ENDPOINT = '/api/public/law-firms'
const BRANDS_FAILURE_MESSAGE = '品牌列表加载失败，请稍后重试'
const BRAND_DETAIL_FAILURE_MESSAGE = '品牌详情加载失败，请稍后重试'
const LAW_FIRMS_FAILURE_MESSAGE = '律所列表加载失败，请稍后重试'
const LAW_FIRM_DETAIL_FAILURE_MESSAGE = '律所详情加载失败，请稍后重试'

/** 品牌库按侵权类型、案件号、品牌名或律所名检索（服务端完成筛选与分页）。 */
export async function fetchBrandDirectory(query: BrandDirectoryQuery = {}): Promise<BrandDirectoryPage> {
  const params: Record<string, string | number> = {}
  const keyword = query.keyword?.trim()
  if (keyword) params.keyword = keyword
  if (query.caseType) params.caseType = query.caseType
  if (typeof query.page === 'number') params.page = query.page
  if (typeof query.pageSize === 'number') params.pageSize = query.pageSize

  const payload = await requestPublicApi<BrandSummary[]>(BRANDS_ENDPOINT, params)
  const items = unwrapPublicApiData(payload, BRANDS_FAILURE_MESSAGE)
  if (!Array.isArray(items)) throw new Error(BRANDS_FAILURE_MESSAGE)
  const meta = payload.meta ?? {}
  const response = payload as typeof payload & { stats?: Partial<BrandDirectoryStats> }
  const total = positiveInt(meta.total, items.length)
  const pageSize = positiveInt(meta.pageSize, 20)
  return {
    items,
    total,
    page: positiveInt(meta.page, 1),
    pageSize,
    totalPages: positiveInt(meta.totalPages, total > 0 ? Math.ceil(total / pageSize) : 1),
    stats: {
      total: positiveInt(response.stats?.total, 0),
      trademark: positiveInt(response.stats?.trademark, 0),
      patent: positiveInt(response.stats?.patent, 0),
      copyright: positiveInt(response.stats?.copyright, 0),
    },
  }
}

/** 品牌列表；关联案件数由公开接口实时统计。 */
export async function fetchBrands(): Promise<BrandSummary[]> {
  const payload = await requestPublicApi<BrandSummary[]>(BRANDS_ENDPOINT)
  return unwrapPublicApiData(payload, BRANDS_FAILURE_MESSAGE)
}

/** 品牌详情；不存在返回 null，其余失败抛出中文错误。 */
export async function fetchBrandDetail(slug: string): Promise<BrandDetail | null> {
  try {
    const payload = await requestPublicApi<BrandDetail>(`${BRANDS_ENDPOINT}/${encodeURIComponent(slug)}`)
    return unwrapPublicApiData(payload, BRAND_DETAIL_FAILURE_MESSAGE)
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error instanceof Error ? error : new Error(BRAND_DETAIL_FAILURE_MESSAGE)
  }
}

/** 律所列表；关联案件数由公开接口实时统计。 */
export async function fetchLawFirms(): Promise<FirmSummary[]> {
  const payload = await requestPublicApi<FirmSummary[]>(LAW_FIRMS_ENDPOINT)
  return unwrapPublicApiData(payload, LAW_FIRMS_FAILURE_MESSAGE)
}

/** 律所详情；不存在返回 null，其余失败抛出中文错误。 */
export async function fetchLawFirmDetail(slug: string): Promise<FirmDetail | null> {
  try {
    const payload = await requestPublicApi<FirmDetail>(`${LAW_FIRMS_ENDPOINT}/${encodeURIComponent(slug)}`)
    return unwrapPublicApiData(payload, LAW_FIRM_DETAIL_FAILURE_MESSAGE)
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error instanceof Error ? error : new Error(LAW_FIRM_DETAIL_FAILURE_MESSAGE)
  }
}
