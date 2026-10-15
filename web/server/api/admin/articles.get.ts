// GET /api/admin/articles
//
// 后台文章列表。分页夹取直接复用 utils/public/query.ts 的 resolvePageWindow（与公开接口同一套规则：
// page >= 1、pageSize 1..50 默认 20、越界页返回空数组并把 meta.page 夹到最后一页），本文件不重复实现。
// 筛选：keyword 命中标题 / slug，categoryId 精确匹配，status 只接受 draft|published|archived（非法值忽略）。
// 权限：article:read（viewer 可读，editor / admin 读写）。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { resolvePageWindow } from '../../utils/public/query'
import {
  ADMIN_ARTICLE_COUNT_SQL,
  ADMIN_ARTICLE_LIST_SQL,
  ADMIN_MAX_PAGE_SIZE,
  adminPageSize,
  buildArticleAdminFilterSql,
  mapAdminArticleRow,
  type AdminArticleRow,
} from '../../utils/admin/content-queries'
import { adminAuthError, fail } from '../../utils/admin/http'

type CountRow = { total: number | string | null }

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'article:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少文章读取权限')
  }

  const query = getQuery(event) as Record<string, unknown>
  const filter = buildArticleAdminFilterSql(query)

  try {
    const countRows = await queryTarget<CountRow>(`${ADMIN_ARTICLE_COUNT_SQL}${filter.sql}`, filter.params)
    const total = Number(countRows[0]?.total ?? 0)
    const window = resolvePageWindow(total, query.page, adminPageSize(query.pageSize), ADMIN_MAX_PAGE_SIZE)
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    if (window.beyondLastPage || window.total === 0) return { data: [], meta }

    const rows = await queryTarget<AdminArticleRow>(
      `${ADMIN_ARTICLE_LIST_SQL}${filter.sql}
ORDER BY a.updated_at DESC, a.id DESC
LIMIT ? OFFSET ?`,
      [...filter.params, window.pageSize, window.offset],
    )
    return { data: rows.map(mapAdminArticleRow), meta }
  } catch (error) {
    console.error('[admin-articles] 文章列表查询失败', error)
    return fail(event, 500, 'ARTICLES_QUERY_FAILED', '文章列表加载失败，请稍后重试')
  }
})
