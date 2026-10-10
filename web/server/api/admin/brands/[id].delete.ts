// DELETE /api/admin/brands/[id]
//
// 归档（软删除）：把 status 置为 0，不物理删除——品牌与案件的关联必须保留，
// 物理删除会让 case_brands 悬挂并影响公开页面的品牌统计。
// 幂等：已经是 0 的品牌不重复写审计。
// 权限：brand:write；审计 action：brand_archive。
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
    admin = await requireAdmin(event, 'brand:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少品牌写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')

  try {
    const rows = await queryTarget<EntityStatusRow>('SELECT status FROM brands WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')

    if (Number(row.status ?? 0) !== 0) {
      await executeWrite('UPDATE brands SET status = 0, updated_at = NOW() WHERE id = ?', [id])
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'brand_archive',
        entityType: 'brand',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: '归档品牌（软删除，保留案件关联）',
        before: { status: Number(row.status ?? 1) },
        after: { status: 0 },
      })
    }

    return { data: { id, status: 0 } }
  } catch (error) {
    console.error('[admin-brands] 归档品牌失败', error)
    return fail(event, 500, 'BRAND_ARCHIVE_FAILED', '品牌归档失败，请稍后重试')
  }
})
