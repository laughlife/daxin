// GET /api/public/brands/{slug}
//
// 品牌详情：{ data: { brand, cases } }。cases 为该品牌下已发布案件，按起诉时间倒序。
// 品牌不存在或未启用时返回 404 中文提示。
import { findCasesForEntity, findEntityBySlug } from '../../../utils/public/case-queries'
import { publicApiError, withPublicApi } from '../../../utils/public/http'

export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').trim()

  return withPublicApi(event, '品牌详情加载失败，请稍后重试', async () => {
    if (!slug) {
      return publicApiError(event, 404, 'NOT_FOUND', '品牌不存在或尚未公开')
    }

    const found = await findEntityBySlug('brands', slug)
    if (!found) {
      return publicApiError(event, 404, 'NOT_FOUND', '品牌不存在或尚未公开')
    }

    const cases = await findCasesForEntity('brand', found.id)
    return { data: { brand: found.summary, cases } }
  })
})
