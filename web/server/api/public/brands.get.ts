// GET /api/public/brands
//
// 品牌库列表支持案件号 / 品牌 / 律所关键词、侵权类型与服务端分页。
//
// 一次分页查询同时返回当前页与命中总数：品牌与案件只能按文本匹配，
// 额外再跑一次 COUNT 等于把整段匹配重算一遍（约 1 秒），因此总数取
// COUNT(*) OVER ()；只有请求页码越界时由 findPublicBrandDirectoryPage 补查一次。
import {
  findPublicBrandDirectoryPage,
  findPublicBrandDirectoryStats,
} from '../../utils/public/case-queries'
import { parseBrandDirectoryQuery, resolvePageWindow, MAX_CASE_PAGE_SIZE } from '../../utils/public/query'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '品牌列表加载失败，请稍后重试', async () => {
    const query = parseBrandDirectoryQuery(getQuery(event) as Record<string, unknown>)
    const [stats, page] = await Promise.all([
      findPublicBrandDirectoryStats(),
      findPublicBrandDirectoryPage(query),
    ])
    const window = resolvePageWindow(page.total, query.page, query.pageSize, MAX_CASE_PAGE_SIZE)
    // 越界页不返回数据：查询按请求页码取数，offset 超出结果数时本身就是空数组。
    const items = window.beyondLastPage ? [] : page.items

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
