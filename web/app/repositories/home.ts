// 首页仓储：推荐阅读与成功案例预览。
//
// 只读取公开接口，失败时抛出中文 Error 交给页面展示错误状态；不回退 Mock 数据。
// stats 由页面既有的本地常量兜底（接口暂不提供统计项），这里固定返回空数组。
import type { ArticleRecord, CaseRecord } from '../types/content'
import { requestPublicApi, unwrapPublicApiData } from '../utils/publicApi'
import type { ArticleSummary } from './articles'

export interface HomeData {
  stats: unknown[]
  /** 首页成功案例预览，最多 6 条 */
  featuredCases: CaseRecord[]
  /** 推荐阅读，最多 6 条 */
  recentArticles: ArticleRecord[]
}

interface HomePayload {
  featuredCases?: CaseRecord[]
  recentArticles?: ArticleSummary[]
}

const HOME_ENDPOINT = '/api/public/home'
const HOME_FAILURE_MESSAGE = '首页数据加载失败，请稍后重试'

/** 公开接口不返回置顶标记，首页推荐位统一按非置顶处理。 */
function toArticleRecord(article: ArticleSummary): ArticleRecord {
  return { ...article, isFeatured: false }
}

export async function fetchHomeData(): Promise<HomeData> {
  const payload = await requestPublicApi<HomePayload>(HOME_ENDPOINT)
  const data = unwrapPublicApiData(payload, HOME_FAILURE_MESSAGE)
  return {
    stats: [],
    featuredCases: Array.isArray(data.featuredCases) ? data.featuredCases : [],
    recentArticles: Array.isArray(data.recentArticles) ? data.recentArticles.map(toArticleRecord) : [],
  }
}
