// DELETE /api/admin/cases/[id]
//
// 软归档：只把 publish_status 置为 'archived'，不物理删除（保留迁移来源与品牌 / 律所关联）。
// 幂等：已经是 archived 的案例不重复写审计。
// 权限：case:write；审计 action：case_archive。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { toRouteId } from '#server/utils/admin/content-queries'
import { adminAuthError, executeWrite, fail, writeAuditSafely } from '#server/utils/admin/http'

interface CasePublishRow {
  publish_status: string | null
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'case:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')

  try {
    const rows = await queryTarget<CasePublishRow>('SELECT publish_status FROM cases WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')

    if (row.publish_status !== 'archived') {
      await executeWrite('UPDATE cases SET publish_status = ?, updated_at = NOW() WHERE id = ?', ['archived', id])
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'case_archive',
        entityType: 'case',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: '归档案例（软删除，保留迁移来源与关联）',
        before: { publish_status: row.publish_status },
        after: { publish_status: 'archived' },
      })
    }

    return { data: { id, publishStatus: 'archived' } }
  } catch (error) {
    console.error('[admin-cases] 归档案例失败', error)
    return fail(event, 500, 'CASE_ARCHIVE_FAILED', '案例归档失败，请稍后重试')
  }
})
