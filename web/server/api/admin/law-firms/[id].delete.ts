// DELETE /api/admin/law-firms/[id]
//
// 归档（软删除）：把 status 置为 0，不物理删除——律所与案件的关联必须保留。
// 幂等：已经是 0 的律所不重复写审计。
// 权限：law_firm:write；审计 action：law_firm_archive。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { toRouteId } from '#server/utils/admin/content-queries'
import { adminAuthError, executeWrite, fail, writeAuditSafely } from '#server/utils/admin/http'

interface EntityStatusRow {
  status: number | string | null
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'law_firm:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少律所写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')

  try {
    const rows = await queryTarget<EntityStatusRow>('SELECT status FROM law_firms WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')

    if (Number(row.status ?? 0) !== 0) {
      await executeWrite('UPDATE law_firms SET status = 0, updated_at = NOW() WHERE id = ?', [id])
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'law_firm_archive',
        entityType: 'law_firm',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: '归档律所（软删除，保留案件关联）',
        before: { status: Number(row.status ?? 1) },
        after: { status: 0 },
      })
    }

    return { data: { id, status: 0 } }
  } catch (error) {
    console.error('[admin-law-firms] 归档律所失败', error)
    return fail(event, 500, 'LAW_FIRM_ARCHIVE_FAILED', '律所归档失败，请稍后重试')
  }
})
