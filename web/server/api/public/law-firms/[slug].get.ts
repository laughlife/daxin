// GET /api/public/law-firms/{slug}
//
// 律所详情：{ data: { firm, cases } }。cases 为该律所下已发布案件，按起诉时间倒序。
// 律所不存在或未启用时返回 404 中文提示。
import { findCasesForEntity, findEntityBySlug } from '../../../utils/public/case-queries'
import { publicApiError, withPublicApi } from '../../../utils/public/http'

export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').trim()

  return withPublicApi(event, '律所详情加载失败，请稍后重试', async () => {
    if (!slug) {
      return publicApiError(event, 404, 'NOT_FOUND', '律所不存在或尚未公开')
    }

    const found = await findEntityBySlug('law_firms', slug)
    if (!found) {
      return publicApiError(event, 404, 'NOT_FOUND', '律所不存在或尚未公开')
    }

    const cases = await findCasesForEntity('law_firm', found.id)
    return { data: { firm: found.summary, cases } }
  })
})
