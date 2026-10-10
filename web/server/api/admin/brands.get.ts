// GET /api/admin/brands
//
// 后台品牌列表。分页夹取复用 utils/public/query.ts 的 resolvePageWindow（与公开接口同一套规则）。
// 筛选：keyword 命中名称 / 英文名 / slug / 别名；status 只接受 1/0（也接受 active/archived），非法值忽略。
// caseCount 由 case_brands 实时统计（只读，不接受后台写入）。
// 权限：brand:read。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { resolvePageWindow } from '../../utils/public/query'
import {
  adminEntityCountSql,
  adminEntityListSql,
  adminPageSize,
  buildEntityAdminFilterSql,
  mapAdminEntityRow,
  type AdminEntityRow,
} from '../../utils/admin/content-queries'
import { adminAuthError, fail } from '../../utils/admin/http'

type CountRow = { total: number | string | null }

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'brand:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少品牌读取权限')
  }

  const query = getQuery(event) as Record<string, unknown>
  const filter = buildEntityAdminFilterSql(query)

  try {
    const countRows = await queryTarget<CountRow>(`${adminEntityCountSql('brands')}${filter.sql}`, filter.params)
    const total = Number(countRows[0]?.total ?? 0)
    const window = resolvePageWindow(total, query.page, adminPageSize(query.pageSize))
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    if (window.beyondLastPage || window.total === 0) return { data: [], meta }

    const rows = await queryTarget<AdminEntityRow>(
      `${adminEntityListSql('brands')}${filter.sql}
ORDER BY e.status DESC, e.name ASC, e.id ASC
LIMIT ? OFFSET ?`,
      [...filter.params, window.pageSize, window.offset],
    )
    return { data: rows.map(mapAdminEntityRow), meta }
  } catch (error) {
    console.error('[admin-brands] 品牌列表查询失败', error)
    return fail(event, 500, 'BRANDS_QUERY_FAILED', '品牌列表加载失败，请稍后重试')
  }
})
