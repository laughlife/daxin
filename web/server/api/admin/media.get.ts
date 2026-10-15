// GET /api/admin/media
//
// 媒体库列表：keyword（object_key / title / file_name）、usageScope、page、pageSize。
// 约定：
//   - 先校验管理员登录态与 media:read 权限（异常转 401/403 JSON，同 media.post.ts）；
//   - 默认排除软删除行（deleted_at IS NULL），includeDeleted=1 时一并返回；
//   - 排序固定 created_at DESC, id DESC（新上传的排在最前）；
//   - 分页复用 utils/public/query.ts 的夹取逻辑：page >= 1，pageSize 1..50，越界页夹到最后一页。
import type { H3Event } from 'h3'
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { escapeLikePattern } from '../../utils/public/article-query'
import { normalizePage, normalizePageSize, normalizeText, resolvePageWindow } from '../../utils/public/query'
import { ADMIN_DEFAULT_PAGE_SIZE, ADMIN_MAX_PAGE_SIZE } from '../../utils/admin/content-queries'

type ApiError = { error: { code: string; message: string } }

const MAX_SCOPE_LENGTH = 32
const MAX_KEYWORD_LENGTH = 128

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): ApiError {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少媒体读取权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function fail(event: H3Event, status: number, code: string, message: string): ApiError {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

interface MediaRow {
  id: number | string | null
  object_key: string | null
  public_url: string | null
  file_name: string | null
  mime_type: string | null
  byte_size: number | string | null
  width: number | string | null
  height: number | string | null
  usage_scope: string | null
  title: string | null
  created_at: Date | string | null
  deleted_at: Date | string | null
}

interface MediaListItem {
  id: number
  objectKey: string
  publicUrl: string
  fileName: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  usageScope: string
  title: string
  createdAt: string
  /** 契约字段之外补充：includeDeleted=1 时用于区分已软删除的行。 */
  deletedAt: string | null
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

/** 可空正整数：0/NULL/非法一律返回 null（非图片的 width/height 为 NULL）。 */
function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function toIsoString(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function toDeletedAt(value: unknown): string | null {
  const iso = toIsoString(value)
  return iso || null
}

/** 解析 includeDeleted：'1' / 'true' / 1 都视为包含已删除行。 */
function parseIncludeDeleted(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(entry => parseIncludeDeleted(entry))
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

/** pageSize 缺省时用后台统一默认值（其余情况交给共享夹取函数）。 */
function resolvePageSize(value: unknown): number {
  const text = normalizeText(value)
  if (!text) return ADMIN_DEFAULT_PAGE_SIZE
  return normalizePageSize(value, ADMIN_MAX_PAGE_SIZE)
}

function mapRow(row: MediaRow): MediaListItem {
  return {
    id: Math.trunc(num(row.id)),
    objectKey: str(row.object_key),
    publicUrl: str(row.public_url),
    fileName: str(row.file_name),
    mimeType: str(row.mime_type),
    byteSize: Math.trunc(num(row.byte_size)),
    width: nullableNum(row.width),
    height: nullableNum(row.height),
    usageScope: str(row.usage_scope),
    title: str(row.title),
    createdAt: toIsoString(row.created_at),
    deletedAt: toDeletedAt(row.deleted_at),
  }
}

const MEDIA_COLUMNS = `id, object_key, public_url, file_name, mime_type, byte_size, width, height,
    usage_scope, title, created_at, deleted_at`

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'media:read')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const query = getQuery(event) as Record<string, unknown>
  const keyword = normalizeText(query.keyword).slice(0, MAX_KEYWORD_LENGTH)
  const usageScope = normalizeText(query.usageScope).slice(0, MAX_SCOPE_LENGTH)
  const includeDeleted = parseIncludeDeleted(query.includeDeleted)

  const clauses: string[] = []
  const params: unknown[] = []

  if (!includeDeleted) clauses.push('deleted_at IS NULL')
  if (keyword) {
    // LIKE 中的 % 与 _ 当普通字符处理，配合 ESCAPE '!'。
    const pattern = `%${escapeLikePattern(keyword)}%`
    clauses.push(`(
    object_key LIKE ? ESCAPE '!'
    OR title LIKE ? ESCAPE '!'
    OR file_name LIKE ? ESCAPE '!'
  )`)
    params.push(pattern, pattern, pattern)
  }
  if (usageScope) {
    clauses.push('usage_scope = ?')
    params.push(usageScope)
  }

  const where = clauses.length > 0 ? `\n WHERE ${clauses.join('\n   AND ')}` : ''

  try {
    const countRows = await queryTarget<{ total: number | string | null }>(
      `SELECT COUNT(*) AS total FROM media_assets${where}`,
      params,
    )
    const total = Math.trunc(num(countRows[0]?.total))
    const window = resolvePageWindow(total, normalizePage(query.page), resolvePageSize(query.pageSize), ADMIN_MAX_PAGE_SIZE)

    // 越界页按契约返回空数组，不再查库。
    const rows = window.beyondLastPage
      ? []
      : await queryTarget<MediaRow>(
        `SELECT ${MEDIA_COLUMNS}
           FROM media_assets${where}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
        [...params, window.pageSize, window.offset],
      )

    return {
      data: rows.map(mapRow),
      meta: {
        page: window.page,
        pageSize: window.pageSize,
        total: window.total,
        totalPages: window.totalPages,
      },
    }
  } catch (error) {
    console.error('[admin-media] 读取媒体列表失败', error)
    return fail(event, 500, 'MEDIA_READ_FAILED', '媒体列表加载失败，请稍后重试')
  }
})
