// GET /api/admin/law-firms/[id]
//
// 后台律所详情：基础字段 + 小程序采集字段（简称 / 地址 / 官网 / Logo）+ 关联案件数 + 简介 + 图片。
// 权限：law_firm:read。
import { requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { adminEntityDetailSql, adminEntityImagesSql, mapAdminEntityRow, toRouteId, type AdminEntityRow } from '#server/utils/admin/content-queries'
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
    const images = await queryTarget<{ image_url: string }>(adminEntityImagesSql('law_firms'), [id])
    return {
      data: {
        lawFirm: mapAdminEntityRow({ ...row, images: images.map(item => item.image_url) }),
      },
    }
  } catch (error) {
    console.error('[admin-law-firm-detail] 律所详情查询失败', error)
    return fail(event, 500, 'LAW_FIRM_QUERY_FAILED', '律所加载失败，请稍后重试')
  }
})
