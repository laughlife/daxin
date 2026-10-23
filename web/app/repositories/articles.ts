// 文章仓储：页面只通过这里取数。
//
// 约定（见 docs/superpowers/task6-data-contract.md）：
//   - 失败时抛出带中文消息的 Error，由页面显示错误状态；
//   - 绝不回退到 web/app/data/mock/* 的演示数据；
//   - 统一走 app/utils/publicApi.ts 的公开接口取数工具。
import { clampPage } from '../utils/content'
import {
  PublicApiError,
  isNotFoundError,
  positiveInt,
  requestPublicApi,
  unwrapPublicApiData,
} from '../utils/publicApi'

/** 文章列表项，字段与公开接口一致。 */
export interface ArticleSummary {
  /** 微信原文标题字号（px）；为空时用默认字号 */
  titleFontSize?: number | null
  id: string
  slug: string
  title: string
  /** 中文展示分类，如 “TRO 侵权预警” */
  category: string
  publishedAt: string
  href: string
  imageSrc: string | null
  imageAlt: string
}

export interface ArticleQuery {
  /** 分类 slug，如 tro-alert */
  category?: string
  keyword?: string
  /** 发布时间起（YYYY-MM-DD） */
  from?: string
  /** 发布时间止（YYYY-MM-DD） */
  to?: string
  page?: number
  pageSize?: number
}

export interface ArticlePage {
  items: ArticleSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const ARTICLES_ENDPOINT = '/api/public/articles'
const LIST_FAILURE_MESSAGE = '文章列表加载失败，请稍后重试'
const DETAIL_FAILURE_MESSAGE = '文章加载失败，请稍后重试'
/** 与契约一致：列表默认每页 12 条（服务端上限 48）。 */
const DEFAULT_PAGE_SIZE = 12

/** 只保留有效参数，避免把空串塞进查询串。 */
function toQueryParams(query: ArticleQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const category = query.category?.trim()
  if (category) params.category = category
  const keyword = query.keyword?.trim()
  if (keyword) params.keyword = keyword
  if (query.from) params.from = query.from
  if (query.to) params.to = query.to
  if (typeof query.page === 'number') params.page = query.page
  if (typeof query.pageSize === 'number') params.pageSize = query.pageSize
  return params
}

/** 文章列表（服务端已完成分页夹取）。 */
export async function fetchArticles(query: ArticleQuery = {}): Promise<ArticlePage> {
  const payload = await requestPublicApi<ArticleSummary[]>(ARTICLES_ENDPOINT, toQueryParams(query))
  const items = unwrapPublicApiData(payload, LIST_FAILURE_MESSAGE)
  if (!Array.isArray(items)) {
    throw new PublicApiError('文章列表数据格式异常，请稍后重试', 0, 'INVALID_RESPONSE')
  }

  const meta = payload.meta ?? {}
  const total = positiveInt(meta.total, items.length)
  const pageSize = positiveInt(meta.pageSize, DEFAULT_PAGE_SIZE)
  const totalPages = positiveInt(meta.totalPages, total > 0 ? Math.ceil(total / pageSize) : 1)

  return { items, total, page: clampPage(meta.page, totalPages), pageSize, totalPages }
}

/** 文章详情；未找到或未发布返回 null，其余失败抛出中文错误。 */
export async function fetchArticleDetail(slug: string): Promise<{ article: ArticleSummary; html: string } | null> {
  const trimmed = String(slug ?? '').trim()
  if (!trimmed) return null
  const path = `${ARTICLES_ENDPOINT}/${encodeURIComponent(trimmed)}`
  try {
    const payload = await requestPublicApi<{ article: ArticleSummary; html?: string }>(path)
    const data = unwrapPublicApiData(payload, DETAIL_FAILURE_MESSAGE)
    if (!data?.article) throw new PublicApiError('文章数据格式异常，请稍后重试', 0, 'INVALID_RESPONSE')
    return { article: data.article, html: typeof data.html === 'string' ? data.html : '' }
  } catch (error) {
    if (isNotFoundError(error)) return null
    throw error instanceof Error ? error : new Error(DETAIL_FAILURE_MESSAGE)
  }
}
