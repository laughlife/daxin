// DELETE /api/admin/users/:id
//
// 删除后台账号（仅 admin：admin:user:write）。
//   - 不允许删除自己；
//   - 不允许删除最后一个启用的管理员；
//   - 删除时同时清理该账号的角色关联与登录会话（否则已签发的会话还能继续用）；
//   - 审计 action：admin_user_delete，写审计时**先写日志再删数据**不可行（外键与一致性），
//     因此这里先删业务数据、再写审计，审计里保留被删账号的用户名便于追溯。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { findAdminById } from '#server/utils/auth/admin-user'
import { executeWrite, fail, adminAuthError, writeAuditSafely } from '#server/utils/admin/http'
import { countActiveAdmins, userHasAdminRole } from '#server/utils/admin/user-queries'

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'admin:user:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号无权重删除后台账号')
  }

  const raw = getRouterParam(event, 'id')
  const userId = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return fail(event, 400, 'INVALID_ID', '账号 id 不合法')
  }

  if (userId === admin.id) {
    return fail(event, 400, 'CANNOT_DELETE_SELF', '不能删除自己的账号')
  }

  const target = await findAdminById(userId)
  if (!target) return fail(event, 404, 'USER_NOT_FOUND', '账号不存在')

  // 最后一个启用的管理员不可删
  if (await userHasAdminRole(userId)) {
    const activeAdmins = await countActiveAdmins()
    const isActiveAdmin = target.status === 'active'
    if (isActiveAdmin && activeAdmins <= 1) {
      return fail(event, 400, 'LAST_ADMIN', '系统必须保留至少一个启用的管理员账号')
    }
  }

  try {
    // 先撤会话，避免删除后已签发的 Cookie 仍然有效
    await executeWrite('DELETE FROM admin_sessions WHERE user_id = ?', [userId])
    await executeWrite('DELETE FROM admin_user_roles WHERE user_id = ?', [userId])
    await executeWrite('DELETE FROM admin_users WHERE id = ?', [userId])

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'admin_user_delete',
      entityType: 'admin_user',
      entityId: userId,
      ipDigest: getIpDigest(event),
      note: `删除后台账号 ${target.username}`,
      before: { username: target.username, displayName: target.displayName, roles: target.roles },
    })

    return { data: { id: userId, deleted: true } }
  } catch (error) {
    console.error('[admin-users] 删除账号失败', error)
    return fail(event, 500, 'USER_DELETE_FAILED', '账号删除失败，请稍后重试')
  }
})
