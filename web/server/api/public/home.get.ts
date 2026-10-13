// GET /api/public/home
//
// 首页数据：四类案例分享（每类最近 3 篇）+ 成功案例预览（最多 6 条已发布案件）。
// 案件映射复用 utils/public/case-mapper.ts 的 mapCaseRecord，保证与案件列表接口同口径。
import { queryTarget } from '../../utils/db/query'
import { queryRecentArticleRowsByCategory } from '../../utils/public/article-sql'
import { toArticleSummary, type ArticleSummary } from '../../utils/public/article-query'
import { mapCaseRecord } from '../../utils/public/case-mapper'
import type { CaseRecord } from '../../../app/types/content'
// @ts-ignore 公开接口与前端仓储共享无副作用的归一化函数。
import { normalizeCoreAdvantages, normalizeTeamServices } from '../../../app/utils/homeData.mjs'

/** 首页成功案例预览条数。 */
const HOME_CASE_LIMIT = 6

/**
 * 首页「案例分享」的四个分类（需求：案例模块分四类、每类只展示近三篇）。
 * 顺序即展示顺序；空分类仍会返回空数组，由前端显示空状态。
 */
export const HOME_ARTICLE_CATEGORIES = [
  { slug: 'tro-alert', section: 'tro' },
  { slug: 'tro-success', section: 'tro' },
  { slug: 'labor-case', section: 'labor' },
  { slug: 'freight-case', section: 'freight' },
] as const

/** 每类取近 3 篇。 */
const HOME_ARTICLES_PER_CATEGORY = 3

const HOME_TEAM_SERVICES_SQL = `SELECT ss.slug, ss.title, ss.summary, ss.sort_order AS section_sort_order, ss.status AS section_status,
  si.title AS item_title, si.summary AS item_summary, si.sort_order AS item_sort_order, si.status AS item_status
FROM service_sections ss
LEFT JOIN service_items si ON si.section_id = ss.id
WHERE ss.status = 1
ORDER BY ss.sort_order, ss.id, si.sort_order, si.id`

const HOME_CORE_ADVANTAGES_SQL = `SELECT setting_value
FROM site_settings
WHERE setting_key = 'home_core_advantages' AND is_current = 1 AND status = 'published'
ORDER BY version DESC, id DESC
LIMIT 1`

/**
 * 首页案件预览：优先 filed_at 最新的已发布案件（NULL 排最后）。
 * 品牌、主代理律所、侵权类型各取一条，避免在映射阶段逐条查库。
 */
const HOME_CASE_SQL = `SELECT c.id, c.case_number, c.filed_at, c.plaintiff, c.summary,
  (
    SELECT b.name
    FROM case_brands cb
    JOIN brands b ON b.id = cb.brand_id AND b.status = 1
    WHERE cb.case_id = c.id
    ORDER BY cb.brand_id
    LIMIT 1
  ) AS brand_name,
  (
    SELECT lf.name
    FROM case_law_firms clf
    JOIN law_firms lf ON lf.id = clf.law_firm_id AND lf.status = 1
    WHERE clf.case_id = c.id
    ORDER BY clf.is_primary DESC, clf.law_firm_id
    LIMIT 1
  ) AS firm_name,
  (
    SELECT ip.slug
    FROM case_ip_types cip
    JOIN ip_types ip ON ip.id = cip.ip_type_id AND ip.status = 1
    WHERE cip.case_id = c.id
    ORDER BY ip.sort_order, ip.id
    LIMIT 1
  ) AS ip_slug
FROM cases c
WHERE c.publish_status = 'published'
ORDER BY (c.filed_at IS NULL), c.filed_at DESC, c.id DESC
LIMIT ?`

interface HomeCaseRow {
  id: number | string | null
  case_number: string | null
  filed_at: string | Date | null
  plaintiff: string | null
  summary: string | null
  brand_name: string | null
  firm_name: string | null
  ip_slug: string | null
}

interface HomeTeamServiceRow {
  slug: string | null
  title: string | null
  summary: string | null
  section_sort_order: number | string | null
  section_status: number | string | null
  item_title: string | null
  item_summary: string | null
  item_sort_order: number | string | null
  item_status: number | string | null
}

interface HomeCoreAdvantagesRow {
  setting_value: string | null
}

function toFeaturedCase(row: HomeCaseRow): CaseRecord {
  return mapCaseRecord(row, {
    brandNames: row.brand_name ? [row.brand_name] : [],
    lawFirmNames: row.firm_name ? [row.firm_name] : [],
    ipTypeSlugs: row.ip_slug ? [row.ip_slug] : [],
  })
}

function toTeamServices(rows: HomeTeamServiceRow[]) {
  const sections = new Map<string, { slug: string, title: string, description: string, status: number, items: Array<{ title: string, description: string, status: number }> }>()
  for (const row of rows) {
    const slug = String(row.slug ?? '').trim()
    if (!slug) continue
    const section = sections.get(slug) ?? {
      slug,
      title: String(row.title ?? '').trim(),
      description: String(row.summary ?? '').trim(),
      status: Number(row.section_status ?? 1),
      items: [],
    }
    if (row.item_title && Number(row.item_status ?? 1) === 1) {
      section.items.push({
        title: String(row.item_title).trim(),
        description: String(row.item_summary ?? '').trim(),
        status: Number(row.item_status ?? 1),
      })
    }
    sections.set(slug, section)
  }
  return normalizeTeamServices([...sections.values()])
}

/** 首页案例分享的一个栏目。 */
export interface HomeArticleColumn {
  slug: string
  section: string
  articles: ArticleSummary[]
}

export default defineEventHandler(async (event) => {
  try {
    const categorySlugs = HOME_ARTICLE_CATEGORIES.map((item) => item.slug)
    const [articleRows, caseRows, teamServiceRows, coreAdvantageRows] = await Promise.all([
      queryRecentArticleRowsByCategory(categorySlugs, HOME_ARTICLES_PER_CATEGORY),
      queryTarget<HomeCaseRow>(HOME_CASE_SQL, [HOME_CASE_LIMIT]),
      queryTarget<HomeTeamServiceRow>(HOME_TEAM_SERVICES_SQL),
      queryTarget<HomeCoreAdvantagesRow>(HOME_CORE_ADVANTAGES_SQL),
    ])

    // 行已按 分类、名次 排序；这里按分类归组，并保证四类都出现（空分类也返回空数组）。
    // 注意：toArticleSummary 的 category 是**中文分类名**，不能用来归组，
    // 必须用原始行的 category_slug（否则分组永远匹配不到）。
    const byCategory = new Map<string, ArticleSummary[]>()
    for (const row of articleRows) {
      const slug = String(row.category_slug ?? '').trim().toLowerCase()
      if (!slug) continue
      const list = byCategory.get(slug) ?? []
      list.push(toArticleSummary(row))
      byCategory.set(slug, list)
    }

    return {
      data: {
        featuredCases: caseRows.map(toFeaturedCase),
        articleColumns: HOME_ARTICLE_CATEGORIES.map((category) => ({
          slug: category.slug,
          section: category.section,
          articles: byCategory.get(category.slug) ?? [],
        })),
        teamServices: toTeamServices(teamServiceRows),
        coreAdvantages: normalizeCoreAdvantages(coreAdvantageRows[0]?.setting_value ?? null),
      },
    }
  } catch (error) {
    console.error('[public-home] 首页数据查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'HOME_QUERY_FAILED', message: '首页数据加载失败，请稍后重试' } }
  }
})
