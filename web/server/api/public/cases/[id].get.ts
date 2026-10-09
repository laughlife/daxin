// GET /api/public/cases/{slug-or-number}
//
// 详情路由使用案件号（slug 形式，如 24-cv-0006），不区分大小写。
// 未找到或未发布统一返回 404 中文提示。
import { findPublishedCaseByNumber } from '../../../utils/public/case-queries'
import { publicApiError, withPublicApi } from '../../../utils/public/http'

export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'id') ?? '').trim()

  return withPublicApi(event, '案件详情加载失败，请稍后重试', async () => {
    if (!slug) {
      return publicApiError(event, 404, 'NOT_FOUND', '案件不存在或尚未公开')
    }

    const record = await findPublishedCaseByNumber(slug)
    if (!record) {
      return publicApiError(event, 404, 'NOT_FOUND', '案件不存在或尚未公开')
    }

    return { data: record }
  })
})
