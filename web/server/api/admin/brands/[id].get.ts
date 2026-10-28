// GET /api/admin/brands/[id]
//
// 后台品牌详情：基础字段 + 小程序采集字段（分类 / 品牌方 / 封面）+ 关联案件数 + 简介 + 图片。
// region 恒为空串（品牌没有地区列），保持品牌 / 律所响应结构一致。
// 权限：brand:read。
import { requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { adminEntityDetailSql, adminEntityImagesSql, mapAdminEntityRow, toRouteId, type AdminEntityRow } from '#server/utils/admin/content-queries'
import { adminAuthError, fail } from '#server/utils/admin/http'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'brand:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少品牌读取权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')

  try {
    const rows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('brands'), [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')
    const images = await queryTarget<{ image_url: string }>(adminEntityImagesSql('brands'), [id])
    return {
      data: {
        brand: mapAdminEntityRow({ ...row, images: images.map(item => item.image_url) }),
      },
    }
  } catch (error) {
    console.error('[admin-brand-detail] 品牌详情查询失败', error)
    return fail(event, 500, 'BRAND_QUERY_FAILED', '品牌加载失败，请稍后重试')
  }
})
