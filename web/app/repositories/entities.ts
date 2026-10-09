// 品牌 / 律所仓储：页面只通过这里取实体数据，不直接 $fetch 接口。
//
// 接口失败时抛出带中文消息的 Error（由页面展示错误状态），绝不回退 Mock。
import type { CaseRecord } from '../types/content'
import {
  isNotFoundError,
  requestPublicApi,
  unwrapPublicApiData,
} from '../utils/publicApi'

export interface BrandSummary {
  slug: string
  name: string
  description: string
  caseCount: number
}

export interface FirmSummary {
  slug: string
  name: string
  description: string
  caseCount: number
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

/** 品牌列表；caseCount 来自数据库 case_count 列。 */
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

/** 律所列表；caseCount 来自数据库 case_count 列。 */
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
