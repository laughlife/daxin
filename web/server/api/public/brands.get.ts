// GET /api/public/brands
//
// 品牌库列表支持案件号 / 品牌 / 律所关键词、侵权类型与服务端分页。
import {
  countPublicBrandDirectoryEntries,
  findPublicBrandDirectoryPage,
  findPublicBrandDirectoryStats,
} from '../../utils/public/case-queries'
import { parseBrandDirectoryQuery, resolvePageWindow, MAX_CASE_PAGE_SIZE } from '../../utils/public/query'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '品牌列表加载失败，请稍后重试', async () => {
    const query = parseBrandDirectoryQuery(getQuery(event) as Record<string, unknown>)
    const [total, stats] = await Promise.all([
      countPublicBrandDirectoryEntries(query),
      findPublicBrandDirectoryStats(),
    ])
    const window = resolvePageWindow(total, query.page, query.pageSize, MAX_CASE_PAGE_SIZE)
    const items = await findPublicBrandDirectoryPage(query, window)

    return {
      data: items,
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total: window.total,
        totalPages: window.totalPages,
      },
      stats,
    }
  })
})
