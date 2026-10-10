// DELETE /api/admin/media/{id}
//
// 媒体软删除：只置 deleted_at = NOW()，不物理删行（图片可能仍被历史内容引用，
// 物理删除会留下死链且无法追溯）。约定：
//   - 先校验管理员登录态与 media:write 权限（异常转 401/403 JSON，同 media.post.ts）；
//   - id 非法 → 400；行不存在或已软删除 → 404（中文）；
//   - 成功后写审计日志（action=media_delete，entityType=media，entityId=id）。
import type { H3Event } from 'h3'
import { getIpDigest, requireAdmin } from '../../../utils/auth/context'
import { writeAuditLog } from '../../../utils/auth/audit'
import { queryTarget } from '../../../utils/db/query'

type ApiError = { error: { code: string; message: string } }

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): ApiError {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少媒体写入权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function fail(event: H3Event, status: number, code: string, message: string): ApiError {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

interface MediaRow {
  id: number | string | null
  object_key: string | null
  deleted_at: Date | string | null
}

function toIsoString(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/**
 * 取写语句的影响行数。
 * mysql2 的写入结果是 ResultSetHeader 而不是行数组，而 queryTarget 按行数组声明返回类型，
 * 因此这里做一次运行时收窄（与 auth/session-store.ts 的做法一致）。
 */
function affectedRows(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const value = (result as { affectedRows?: unknown }).affectedRows
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export default defineEventHandler(async (event) => {
  let admin: { id: number; username: string }
  try {
    admin = await requireAdmin(event, 'media:write')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const rawId = Number(String(getRouterParam(event, 'id') ?? '').trim())
  if (!Number.isInteger(rawId) || rawId <= 0) {
    return fail(event, 400, 'INVALID_ID', '媒体 id 不合法')
  }

  try {
    const rows = await queryTarget<MediaRow>(
      'SELECT id, object_key, deleted_at FROM media_assets WHERE id = ? LIMIT 1',
      [rawId],
    )
    const row = rows[0]
    if (!row) return fail(event, 404, 'MEDIA_NOT_FOUND', '媒体不存在或已被删除')
    if (row.deleted_at) return fail(event, 404, 'MEDIA_NOT_FOUND', '媒体不存在或已被删除')

    // 带 deleted_at IS NULL 条件，避免并发重复删除互相覆盖删除时间。
    const updateResult = await queryTarget(
      'UPDATE media_assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [rawId],
    )
    if (affectedRows(updateResult) === 0) return fail(event, 404, 'MEDIA_NOT_FOUND', '媒体不存在或已被删除')

    const updated = await queryTarget<MediaRow>(
      'SELECT id, object_key, deleted_at FROM media_assets WHERE id = ? LIMIT 1',
      [rawId],
    )
    const deletedAt = toIsoString(updated[0]?.deleted_at) || new Date().toISOString()
    const objectKey = String(updated[0]?.object_key ?? row.object_key ?? '')

    try {
      await writeAuditLog({
        userId: admin.id,
        username: admin.username,
        action: 'media_delete',
        entityType: 'media',
        entityId: rawId,
        after: { id: rawId, deletedAt },
        ipDigest: getIpDigest(event),
        note: `软删除媒体：objectKey=${objectKey}`,
      })
    } catch (error) {
      // 审计写入失败不影响删除结果。
      console.error('[admin-media] 写入审计日志失败', error)
    }

    return { data: { id: rawId, deletedAt } }
  } catch (error) {
    console.error('[admin-media] 删除媒体失败', error)
    return fail(event, 500, 'MEDIA_DELETE_FAILED', '删除媒体失败，请稍后重试')
  }
})
