// GET /api/public/law-firms
//
// 律所列表：{ data: FirmSummary[] }。caseCount 直接取 law_firms.case_count 列。
import { findEntitySummaries } from '../../utils/public/case-queries'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '律所列表加载失败，请稍后重试', async () => {
    return { data: await findEntitySummaries('law_firms') }
  })
})
