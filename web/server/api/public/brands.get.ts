// GET /api/public/brands
//
// 品牌列表：{ data: BrandSummary[] }。caseCount 直接取 brands.case_count 列。
import { findEntitySummaries } from '../../utils/public/case-queries'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '品牌列表加载失败，请稍后重试', async () => {
    return { data: await findEntitySummaries('brands') }
  })
})
