// GET /api/admin/cases/[id]
//
// 后台案例详情：列表字段 + 可编辑字段（title / summary）+ 当前关联 id
// （brandId / lawFirmId / ipTypeId）。案例的类型不在 cases 表上：caseType 来自
// case_ip_types + ip_types.slug，后台改类型时替换该关联即可（见 buildCaseRelationStatements）。
// 权限：case:read。
import { requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { ADMIN_CASE_DETAIL_SQL, mapAdminCaseDetail, toRouteId, type AdminCaseRow } from '#server/utils/admin/content-queries'
import { adminAuthError, fail } from '#server/utils/admin/http'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'case:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例读取权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')

  try {
    const rows = await queryTarget<AdminCaseRow>(ADMIN_CASE_DETAIL_SQL, [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')
    return { data: { case: mapAdminCaseDetail(row) } }
  } catch (error) {
    console.error('[admin-case-detail] 案例详情查询失败', error)
    return fail(event, 500, 'CASE_QUERY_FAILED', '案例加载失败，请稍后重试')
  }
})
