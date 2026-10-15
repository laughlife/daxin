// GET /api/admin/cases
//
// 后台案例列表。分页夹取复用 utils/public/query.ts 的 resolvePageWindow（与公开接口同一套规则：
// page >= 1、pageSize 1..50 默认 20、越界页返回空数组并把 meta.page 夹到最后一页）。
// 筛选：keyword 命中案件号 / 原告 / 内部标题 / 法院 / 关联品牌名 / 关联律所名；
// status（以及别名 publishStatus）按 publish_status 过滤，非法取值一律忽略。
// 权限：case:read。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { resolvePageWindow } from '../../utils/public/query'
import {
  ADMIN_CASE_COUNT_SQL,
  ADMIN_CASE_LIST_SQL,
  ADMIN_MAX_PAGE_SIZE,
  adminPageSize,
  buildCaseAdminFilterSql,
  mapAdminCaseRow,
  type AdminCaseRow,
} from '../../utils/admin/content-queries'
import { adminAuthError, fail } from '../../utils/admin/http'

type CountRow = { total: number | string | null }

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'case:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例读取权限')
  }

  const query = getQuery(event) as Record<string, unknown>
  const filter = buildCaseAdminFilterSql(query)

  try {
    const countRows = await queryTarget<CountRow>(`${ADMIN_CASE_COUNT_SQL}${filter.sql}`, filter.params)
    const total = Number(countRows[0]?.total ?? 0)
    const window = resolvePageWindow(total, query.page, adminPageSize(query.pageSize), ADMIN_MAX_PAGE_SIZE)
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    if (window.beyondLastPage || window.total === 0) return { data: [], meta }

    const rows = await queryTarget<AdminCaseRow>(
      `${ADMIN_CASE_LIST_SQL}${filter.sql}
ORDER BY c.updated_at DESC, c.id DESC
LIMIT ? OFFSET ?`,
      [...filter.params, window.pageSize, window.offset],
    )
    return { data: rows.map(mapAdminCaseRow), meta }
  } catch (error) {
    console.error('[admin-cases] 案例列表查询失败', error)
    return fail(event, 500, 'CASES_QUERY_FAILED', '案例列表加载失败，请稍后重试')
  }
})
