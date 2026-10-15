// 文章查询 SQL 的唯一来源：列表接口与首页“推荐阅读”共用同一份列口径与过滤条件，
// 避免两处映射漂移。SQL 片段只由常量与 ? 占位符组成，用户输入一律进入参数数组。
import { queryTarget } from '../db/query'
import { escapeLikePattern, type ArticleFilters, type ArticleRow } from './article-query'

/**
 * 列表列口径。配图优先级在应用层用 pickArticleImageSrc 决定：
 * 封面 OSS 地址 → 正文第一张配图的 OSS 地址 → 原文 https 外链 → null。
 * 这里把三个候选都取出来，不做 COALESCE，便于单测与后续替换 OSS。
 */
const ARTICLE_COLUMNS = `a.id, a.slug, a.title,
  DATE_FORMAT(a.published_at, '%Y-%m-%d') AS published_at,
  c.slug AS category_slug,
  c.name AS category_name,
  NULLIF(cover.public_url, '') AS cover_url,
  (
    SELECT NULLIF(m.public_url, '')
    FROM article_images ai
    LEFT JOIN media_assets m ON m.id = ai.media_id AND m.deleted_at IS NULL
    WHERE ai.article_id = a.id
    ORDER BY ai.position, ai.id
    LIMIT 1
  ) AS image_url,
  (
    SELECT NULLIF(ai.source_url, '')
    FROM article_images ai
    WHERE ai.article_id = a.id
    ORDER BY ai.position, ai.id
    LIMIT 1
  ) AS image_source_url,
  (
    SELECT NULLIF(ai.alt_text, '')
    FROM article_images ai
    WHERE ai.article_id = a.id
    ORDER BY ai.position, ai.id
    LIMIT 1
  ) AS image_alt`

const ARTICLE_FROM = `articles a
LEFT JOIN article_categories c ON c.id = a.category_id
LEFT JOIN media_assets cover ON cover.id = a.cover_media_id AND cover.deleted_at IS NULL`

/** 公开文章的基础条件：只有已发布且带发布时间的文章对外可见。 */
export const ARTICLE_BASE_CONDITIONS = `a.status = 'published' AND a.published_at IS NOT NULL`

export const ARTICLE_ORDER_BY = 'ORDER BY a.published_at DESC, a.id DESC'

/** 列表查询（不含 ORDER BY / LIMIT，由调用方拼接分页）。 */
export const ARTICLE_LIST_SQL = `SELECT ${ARTICLE_COLUMNS}
FROM ${ARTICLE_FROM}
WHERE ${ARTICLE_BASE_CONDITIONS}`

/** 详情查询：多取正文 HTML，按 slug 精确命中。 */
export const ARTICLE_DETAIL_SQL = `SELECT ${ARTICLE_COLUMNS}, a.content_html
FROM ${ARTICLE_FROM}
WHERE ${ARTICLE_BASE_CONDITIONS} AND a.slug = ?
LIMIT 1`

export interface ArticleFilterSql {
  /** 以 " AND ..." 开头（可能是空串）的过滤片段。 */
  sql: string
  params: unknown[]
}

/**
 * 拼装文章过滤条件（表别名固定为 a，分类别名 c）。
 * keyword 命中标题 / 正文纯文本；from、to 按 published_at 的自然日筛选。
 * LIKE 的通配符由 escapeLikePattern 转义，配合 SQL 中的 ESCAPE '!'。
 */
export function buildArticleFilterSql(filters: ArticleFilters): ArticleFilterSql {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.category) {
    clauses.push('c.slug = ?')
    params.push(filters.category)
  }

  if (filters.keyword) {
    const like = `%${escapeLikePattern(filters.keyword)}%`
    clauses.push(`(
    a.title LIKE ? ESCAPE '!'
    OR a.content_text LIKE ? ESCAPE '!'
  )`)
    params.push(like, like)
  }

  if (filters.from) {
    clauses.push('a.published_at >= ?')
    params.push(`${filters.from} 00:00:00`)
  }

  if (filters.to) {
    clauses.push('a.published_at <= ?')
    params.push(`${filters.to} 23:59:59`)
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}

export interface ArticleCountRow {
  total: number | string | null
}

/** 统计符合条件的文章总数；与列表查询复用同一份过滤片段与参数。 */
export async function countArticles(filters: ArticleFilters): Promise<number> {
  const { sql, params } = buildArticleFilterSql(filters)
  const rows = await queryTarget<ArticleCountRow>(
    `SELECT COUNT(*) AS total
FROM ${ARTICLE_FROM}
WHERE ${ARTICLE_BASE_CONDITIONS}${sql}`,
    params,
  )
  const total = Number(rows[0]?.total ?? 0)
  return Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0
}

/** 按分页窗口取文章列表行。 */
export async function queryArticleRows(filters: ArticleFilters, limit: number, offset: number): Promise<ArticleRow[]> {
  const { sql, params } = buildArticleFilterSql(filters)
  return queryTarget<ArticleRow>(
    `${ARTICLE_LIST_SQL}${sql}
${ARTICLE_ORDER_BY}
LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
}

/** 取最近若干篇已发布文章（首页推荐阅读）。 */
export async function queryRecentArticleRows(limit: number): Promise<ArticleRow[]> {
  return queryTarget<ArticleRow>(
    `${ARTICLE_LIST_SQL}
${ARTICLE_ORDER_BY}
LIMIT ?`,
    [limit],
  )
}

/**
 * 按分类各取最近若干篇（首页「案例分享」四类栏目）。
 *
 * 需求：案例模块分四类、每类只展示近三篇。
 * 用窗口函数按分类分区取前 N，避免为每个分类各发一次查询（4 次往返）。
 * 只返回已发布且有发布时间的文章，与列表接口同口径。
 */
export async function queryRecentArticleRowsByCategory(
  categorySlugs: string[],
  perCategory: number,
): Promise<ArticleRow[]> {
  if (categorySlugs.length === 0 || perCategory <= 0) return []
  const placeholders = categorySlugs.map(() => '?').join(', ')
  return queryTarget<ArticleRow>(
    `SELECT * FROM (
  SELECT ${ARTICLE_COLUMNS},
    ROW_NUMBER() OVER (PARTITION BY c.slug ORDER BY a.published_at DESC, a.id DESC) AS rn
  FROM ${ARTICLE_FROM}
  WHERE ${ARTICLE_BASE_CONDITIONS} AND c.slug IN (${placeholders})
) ranked
WHERE ranked.rn <= ?
ORDER BY ranked.category_slug, ranked.rn`,
    [...categorySlugs, perCategory],
  )
}
