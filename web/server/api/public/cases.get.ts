// GET /api/public/cases
//
// 查询参数：keyword、caseType、state、from、to、page、pageSize。
// 只返回 publish_status = 'published' 的案件；分页参数经服务端夹取，
// 越界页返回空数组并把 meta.page 夹到最后一页（不会出现 999/9）。
import { MAX_CASE_PAGE_SIZE, parseCaseQuery, resolvePageWindow } from '../../utils/public/query'
import { countPublishedCases, findPublishedCasePage } from '../../utils/public/case-queries'
import { withPublicApi } from '../../utils/public/http'

export default defineEventHandler(async (event) => {
  return withPublicApi(event, '案件列表加载失败，请稍后重试', async () => {
    const query = parseCaseQuery(getQuery(event) as Record<string, unknown>)
    const total = await countPublishedCases(query)
    const window = resolvePageWindow(total, query.page, query.pageSize, MAX_CASE_PAGE_SIZE)
    const items = await findPublishedCasePage(query, window)

    return {
      data: items,
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total: window.total,
        totalPages: window.totalPages,
      },
    }
  })
})
