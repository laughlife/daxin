// GET /api/admin/law-firms/[id]
//
// 后台律所详情；caseCount 由 case_law_firms 实时统计（只读）。
// 权限：law_firm:read。
import { requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { adminEntityDetailSql, mapAdminEntityRow, toRouteId, type AdminEntityRow } from '#server/utils/admin/content-queries'
import { adminAuthError, fail } from '#server/utils/admin/http'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'law_firm:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少律所读取权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')

  try {
    const rows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('law_firms'), [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')
    return { data: { lawFirm: mapAdminEntityRow(row) } }
  } catch (error) {
    console.error('[admin-law-firm-detail] 律所详情查询失败', error)
    return fail(event, 500, 'LAW_FIRM_QUERY_FAILED', '律所加载失败，请稍后重试')
  }
})
