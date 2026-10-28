// GET /api/admin/law-firms
//
// 后台律所列表。分页夹取复用 utils/public/query.ts 的 resolvePageWindow（与公开接口同一套规则）。
// 筛选：keyword 命中名称 / 英文名 / slug / 别名；status 只接受 1/0（也接受 active/archived），非法值忽略。
// caseCount 由 case_law_firms 实时统计（只读，不接受后台写入）。
// 权限：law_firm:read。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { resolvePageWindow } from '../../utils/public/query'
import {
  adminEntityCountSql,
  adminEntityListSql,
  ADMIN_MAX_PAGE_SIZE,
  adminPageSize,
  buildEntityAdminFilterSql,
  mapAdminEntityRow,
  type AdminEntityRow,
} from '../../utils/admin/content-queries'
import { adminAuthError, fail } from '../../utils/admin/http'

type CountRow = { total: number | string | null }

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'law_firm:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少律所读取权限')
  }

  const query = getQuery(event) as Record<string, unknown>
  const filter = buildEntityAdminFilterSql(query, 'law_firms')

  try {
    const countRows = await queryTarget<CountRow>(`${adminEntityCountSql('law_firms')}${filter.sql}`, filter.params)
    const total = Number(countRows[0]?.total ?? 0)
    const window = resolvePageWindow(total, query.page, adminPageSize(query.pageSize), ADMIN_MAX_PAGE_SIZE)
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    if (window.beyondLastPage || window.total === 0) return { data: [], meta }

    const rows = await queryTarget<AdminEntityRow>(
      `${adminEntityListSql('law_firms')}${filter.sql}
ORDER BY e.status DESC, e.name ASC, e.id ASC
LIMIT ? OFFSET ?`,
      [...filter.params, window.pageSize, window.offset],
    )
    return { data: rows.map(mapAdminEntityRow), meta }
  } catch (error) {
    console.error('[admin-law-firms] 律所列表查询失败', error)
    return fail(event, 500, 'LAW_FIRMS_QUERY_FAILED', '律所列表加载失败，请稍后重试')
  }
})
