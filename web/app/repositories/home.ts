// 首页仓储：四类案例分享与成功案例预览。
//
// 只读取公开接口，失败时抛出中文 Error 交给页面展示错误状态；不回退 Mock 数据。
// stats 由页面既有的本地常量兜底（接口暂不提供统计项），这里固定返回空数组。
import type { ArticleRecord, CaseRecord } from '../types/content'
import { requestPublicApi, unwrapPublicApiData } from '../utils/publicApi'
import type { ArticleSummary } from './articles'

/** 首页案例分享的一个栏目（一类最多 3 篇）。 */
export interface HomeArticleColumn {
  /** 分类 slug，如 tro-alert */
  slug: string
  /** 所属业务线：tro / labor / freight */
  section: string
  articles: ArticleRecord[]
}

export interface HomeTeamServiceItem {
  title: string
  description: string
}

export interface HomeTeamServiceSection {
  slug: string
  title: string
  description: string
  items: HomeTeamServiceItem[]
}

export interface CoreAdvantage {
  title: string
  description: string
  highlights: string[]
}

export interface HomeData {
  stats: unknown[]
  /** 首页成功案例预览，最多 6 条 */
  featuredCases: CaseRecord[]
  /** 四类案例分享，每类最多 3 篇；空分类的 articles 为空数组 */
  articleColumns: HomeArticleColumn[]
  teamServices: HomeTeamServiceSection[]
  coreAdvantages: CoreAdvantage[]
}

interface HomePayload {
  featuredCases?: CaseRecord[]
  articleColumns?: Array<{ slug?: string, section?: string, articles?: ArticleSummary[] }>
  teamServices?: HomeTeamServiceSection[]
  coreAdvantages?: CoreAdvantage[]
}

const HOME_ENDPOINT = '/api/public/home'
const HOME_FAILURE_MESSAGE = '首页数据加载失败，请稍后重试'

/** 公开接口不返回置顶标记，首页推荐位统一按非置顶处理。 */
function toArticleRecord(article: ArticleSummary): ArticleRecord {
  return { ...article, isFeatured: false }
}

/** 归一化接口返回的栏目：缺字段时补空值，避免前端解构炸掉。 */
function normalizeColumns(value: HomePayload['articleColumns']): HomeArticleColumn[] {
  if (!Array.isArray(value)) return []
  return value.map((column) => ({
    slug: String(column?.slug ?? ''),
    section: String(column?.section ?? ''),
    articles: Array.isArray(column?.articles) ? column.articles.map(toArticleRecord) : [],
  }))
}

function normalizeTeamServices(value: HomePayload['teamServices']): HomeTeamServiceSection[] {
  if (!Array.isArray(value)) return []
  return value
    .map(section => ({
      slug: String(section?.slug ?? ''),
      title: String(section?.title ?? ''),
      description: String(section?.description ?? ''),
      items: Array.isArray(section?.items)
        ? section.items.map(item => ({
          title: String(item?.title ?? ''),
          description: String(item?.description ?? ''),
        })).filter(item => item.title)
        : [],
    }))
    .filter(section => section.slug && section.title && section.items.length > 0)
}

function normalizeCoreAdvantages(value: HomePayload['coreAdvantages']): CoreAdvantage[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => ({
      title: String(item?.title ?? ''),
      description: String(item?.description ?? ''),
      highlights: Array.isArray(item?.highlights) ? item.highlights.map(value => String(value ?? '')).filter(Boolean) : [],
    }))
    .filter(item => item.title && item.description)
}

export async function fetchHomeData(): Promise<HomeData> {
  const payload = await requestPublicApi<HomePayload>(HOME_ENDPOINT)
  const data = unwrapPublicApiData(payload, HOME_FAILURE_MESSAGE)
  return {
    stats: [],
    featuredCases: Array.isArray(data.featuredCases) ? data.featuredCases : [],
    articleColumns: normalizeColumns(data.articleColumns),
    teamServices: normalizeTeamServices(data.teamServices),
    coreAdvantages: normalizeCoreAdvantages(data.coreAdvantages),
  }
}
