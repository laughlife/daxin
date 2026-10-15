// GET /api/admin/review
//
// 核验队列列表：迁移阶段产生的待人工确认项。
// 约定：
//   - 先校验管理员登录态与 review:read 权限；
//   - 排序固定为 confidence ASC, id ASC —— 置信度最低（信息最少、最需要人看）的排在前面，
//     同分时按 id 升序保证翻页稳定；若用 DESC，则前端第一页全是几乎确定的行，人工成本被浪费；
//   - 分页沿用公开接口的 normalizePage/resolvePageWindow，并统一使用后台上限 50；
//   - 所有筛选条件都进入参数数组，SQL 里只有 ? 占位符。
import type { H3Event } from 'h3'
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { normalizePage, resolvePageWindow } from '../../utils/public/query'
import { ADMIN_DEFAULT_PAGE_SIZE, ADMIN_MAX_PAGE_SIZE } from '../../utils/admin/content-queries'
import { mapReviewRow, normalizeEntityType, normalizeReviewStatus, type ReviewRow } from '../../utils/admin/review-queries'

const DEFAULT_STATUS = 'open'
const TOTAL_COUNT_ALIAS = 'total'
const SELECT_COLUMNS = `id, entity_type, legacy_source_table, legacy_source_id, field_name,
         candidate_value, normalized_value, context_snippet, confidence, status,
         resolved_at, resolution_note`

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): { error: { code: string; message: string } } {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少核验队列读取权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

/** 查询参数可能是数组，取第一个字符串；其余按原样返回。 */
function firstQueryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.find(item => typeof item === 'string') ?? value[0]
  return value
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'review:read')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const query = getQuery(event) as Record<string, unknown>

  // 状态筛选：缺省 -> open；显式传入的未知取值按「不筛选」处理，
  // 这样前端切页/清空筛选不会意外退化成「只看 open」而掩盖已处理数据。
  const rawStatus = firstQueryValue(query.status)
  const hasStatusParam = rawStatus !== undefined && rawStatus !== null && String(rawStatus).trim() !== ''
  const status = hasStatusParam ? normalizeReviewStatus(rawStatus) : DEFAULT_STATUS
  const entityType = normalizeEntityType(firstQueryValue(query.entityType))

  const requestedPage = firstQueryValue(query.page)
  const requestedPageSize = firstQueryValue(query.pageSize)

  const filters: string[] = []
  const filterParams: unknown[] = []
  if (status) {
    filters.push('status = ?')
    filterParams.push(status)
  }
  if (entityType) {
    filters.push('entity_type = ?')
    filterParams.push(entityType)
  }
  const whereSql = filters.map(clause => `\n   AND ${clause}`).join('')

  let total = 0
  try {
    const countRows = await queryTarget<Record<string, unknown>>(
      `SELECT COUNT(*) AS ${TOTAL_COUNT_ALIAS} FROM migration_review_items WHERE 1 = 1${whereSql}`,
      filterParams,
    )
    total = Number(countRows[0]?.[TOTAL_COUNT_ALIAS] ?? 0)
  } catch (error) {
    console.error('[admin-review] 统计核验队列失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'REVIEW_READ_FAILED', message: '读取核验队列失败，请稍后重试' } }
  }

  const pageSize = requestedPageSize === undefined || requestedPageSize === null || String(requestedPageSize).trim() === ''
    ? ADMIN_DEFAULT_PAGE_SIZE
    : requestedPageSize
  const window = resolvePageWindow(total, requestedPage, pageSize, ADMIN_MAX_PAGE_SIZE)
  const meta = {
    page: window.page,
    pageSize: window.pageSize,
    total: window.total,
    totalPages: window.totalPages,
  }

  // 请求页越界时不查库，直接返回空数组（分页元数据仍夹到最后一页）。
  if (window.beyondLastPage) return { data: [], meta }

  let rows: ReviewRow[]
  try {
    rows = await queryTarget<ReviewRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM migration_review_items
        WHERE 1 = 1${whereSql}
        ORDER BY confidence ASC, id ASC
        LIMIT ? OFFSET ?`,
      [...filterParams, window.pageSize, window.offset],
    )
  } catch (error) {
    console.error('[admin-review] 读取核验队列失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'REVIEW_READ_FAILED', message: '读取核验队列失败，请稍后重试' } }
  }

  return { data: rows.map(mapReviewRow), meta }
})
