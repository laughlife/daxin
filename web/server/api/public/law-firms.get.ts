// GET /api/public/law-firms
//
// 律所列表：{ data: FirmSummary[] }。caseCount 实时统计已发布案件。
import { findEntitySummaries } from '../../utils/public/case-queries'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '律所列表加载失败，请稍后重试', async () => {
    const keyword = String((getQuery(event) as Record<string, unknown>).keyword ?? '').trim()
    return { data: await findEntitySummaries('law_firms', keyword) }
  })
})
