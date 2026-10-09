// GET /api/public/home
//
// 首页数据：推荐阅读（最近 6 篇已发布文章）+ 成功案例预览（最多 6 条已发布案件）。
// 案件映射复用 utils/public/case-mapper.ts 的 mapCaseRecord，保证与案件列表接口同口径。
import { queryTarget } from '../../utils/db/query'
import { queryRecentArticleRows } from '../../utils/public/article-sql'
import { toArticleSummary } from '../../utils/public/article-query'
import { mapCaseRecord } from '../../utils/public/case-mapper'
import type { CaseRecord } from '../../../app/types/content'

/** 首页推荐阅读条数。 */
const HOME_ARTICLE_LIMIT = 6
/** 首页成功案例预览条数。 */
const HOME_CASE_LIMIT = 6

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

function toFeaturedCase(row: HomeCaseRow): CaseRecord {
  return mapCaseRecord(row, {
    brandNames: row.brand_name ? [row.brand_name] : [],
    lawFirmNames: row.firm_name ? [row.firm_name] : [],
    ipTypeSlugs: row.ip_slug ? [row.ip_slug] : [],
  })
}

export default defineEventHandler(async (event) => {
  try {
    const [articleRows, caseRows] = await Promise.all([
      queryRecentArticleRows(HOME_ARTICLE_LIMIT),
      queryTarget<HomeCaseRow>(HOME_CASE_SQL, [HOME_CASE_LIMIT]),
    ])

    return {
      data: {
        featuredCases: caseRows.map(toFeaturedCase),
        recentArticles: articleRows.map(toArticleSummary),
      },
    }
  } catch (error) {
    console.error('[public-home] 首页数据查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'HOME_QUERY_FAILED', message: '首页数据加载失败，请稍后重试' } }
  }
})
