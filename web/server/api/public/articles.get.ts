// GET /api/public/articles
//
// 公开文章列表。只返回 status='published' 且 published_at 非空的数据，
// 按发布时间倒序（published_at DESC, id DESC）。分页夹取复用 utils/public/query.ts 的
// resolvePageWindow：页码越界时返回空数组，并把 meta.page 夹到最后一页。
import { countArticles, queryArticleRows } from '../../utils/public/article-sql'
import { parseArticleFilters, toArticleSummary } from '../../utils/public/article-query'
import { resolvePageWindow } from '../../utils/public/query'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  const filters = parseArticleFilters(query)

  try {
    const total = await countArticles(filters)
    const window = resolvePageWindow(total, query.page, query.pageSize)
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    // 越界页与空结果都不再查库，直接返回空列表（meta 仍然给出最后一页与真实总数）。
    if (window.beyondLastPage || window.total === 0) return { data: [], meta }

    const rows = await queryArticleRows(filters, window.pageSize, window.offset)
    return { data: rows.map(toArticleSummary), meta }
  } catch (error) {
    console.error('[public-articles] 文章列表查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'ARTICLES_QUERY_FAILED', message: '文章列表加载失败，请稍后重试' } }
  }
})
