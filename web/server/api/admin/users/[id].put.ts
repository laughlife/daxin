// PUT /api/admin/users/:id
//
// 修改后台账号（仅 admin：admin:user:write）。
//   - 可改：显示名、邮箱、状态、角色、密码（可选，留空表示不改）；
//   - 用户名不可改：它是登录凭据与审计日志的标识，改名会让历史日志对不上人；
//   - **不允许改动自己的角色或停用自己**：否则管理员可能把自己锁在门外，
//     这是不可逆的自伤操作，需要换另一个管理员账号来操作；
//   - **不允许把最后一个启用的管理员降级或停用**，避免后台彻底失去管理者；
//   - 审计 action：admin_user_update，password 变更只记「已重置密码」不记内容。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#server/utils/auth/password'
import { adminAuthError, executeWrite, fail, readAdminBody, writeAuditSafely } from '#server/utils/admin/http'
import { findAdminById } from '#server/utils/auth/admin-user'
import {
  countActiveAdmins,
  replaceUserRoles,
  userHasAdminRole,
  validateDisplayName,
  validateEmail,
  validateRoles,
  validateStatus,
} from '#server/utils/admin/user-queries'

/** 读取并校验路径里的账号 id。 */
function readUserId(event: Parameters<typeof getRouterParam>[0]): number {
  const raw = getRouterParam(event as never, 'id')
  const parsed = Number.parseInt(String(raw ?? ''), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'admin:user:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号无权重修改后台账号')
  }

  const userId = readUserId(event)
  if (!userId) return fail(event, 400, 'INVALID_ID', '账号 id 不合法')

  const target = await findAdminById(userId)
  if (!target) return fail(event, 404, 'USER_NOT_FOUND', '账号不存在')

  const body = await readAdminBody(event)

  const displayNameCheck = validateDisplayName(
    Object.prototype.hasOwnProperty.call(body, 'displayName') ? body.displayName : target.displayName,
  )
  if (!displayNameCheck.ok) return fail(event, 400, 'INVALID_DISPLAY_NAME', displayNameCheck.message)

  const emailCheck = validateEmail(
    Object.prototype.hasOwnProperty.call(body, 'email') ? body.email : target.email,
  )
  if (!emailCheck.ok) return fail(event, 400, 'INVALID_EMAIL', emailCheck.message)

  const statusCheck = validateStatus(
    Object.prototype.hasOwnProperty.call(body, 'status') ? body.status : target.status,
  )
  if (!statusCheck.ok) return fail(event, 400, 'INVALID_STATUS', statusCheck.message)

  const rolesCheck = validateRoles(
    Object.prototype.hasOwnProperty.call(body, 'roles') ? body.roles : target.roles,
  )
  if (!rolesCheck.ok) return fail(event, 400, 'INVALID_ROLES', rolesCheck.message)

  const isSelf = admin.id === userId
  const rolesChanged = JSON.stringify(rolesCheck.value) !== JSON.stringify([...target.roles].sort())
  const statusChanged = statusCheck.value !== target.status

  // 自伤保护：不允许改自己的角色或停用自己
  if (isSelf && rolesChanged) {
    return fail(event, 400, 'CANNOT_CHANGE_OWN_ROLES', '不能修改自己的角色，请用另一个管理员账号操作')
  }
  if (isSelf && statusChanged && statusCheck.value !== 'active') {
    return fail(event, 400, 'CANNOT_DISABLE_SELF', '不能停用自己的账号')
  }

  // 最后管理员保护：降级或停用会移除其 admin 角色/启用状态时，必须还有别的启用管理员
  const losesAdmin = (await userHasAdminRole(userId))
    && (!rolesCheck.value.includes('admin') || statusCheck.value !== 'active')
  if (losesAdmin) {
    const activeAdmins = await countActiveAdmins()
    if (activeAdmins <= 1) {
      return fail(event, 400, 'LAST_ADMIN', '系统必须保留至少一个启用的管理员账号')
    }
  }

  // 密码可选：留空/未提供表示不改
  const rawPassword = body.password
  const nextPassword = typeof rawPassword === 'string' ? rawPassword : ''
  if (nextPassword) {
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      return fail(event, 400, 'WEAK_PASSWORD', `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`)
    }
    if (nextPassword.length > MAX_PASSWORD_LENGTH) {
      return fail(event, 400, 'WEAK_PASSWORD', `密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`)
    }
  }

  try {
    if (nextPassword) {
      const passwordHash = await hashPassword(nextPassword)
      await executeWrite(
        `UPDATE admin_users
         SET display_name = ?, email = ?, status = ?, password_hash = ?, password_algo = 'scrypt',
             failed_login_count = 0, locked_until = NULL, updated_at = NOW()
         WHERE id = ?`,
        [displayNameCheck.value, emailCheck.value, statusCheck.value, passwordHash, userId],
      )
    } else {
      await executeWrite(
        `UPDATE admin_users
         SET display_name = ?, email = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [displayNameCheck.value, emailCheck.value, statusCheck.value, userId],
      )
    }

    if (rolesChanged) await replaceUserRoles(userId, rolesCheck.value)

    const changes: Record<string, unknown> = {}
    if (displayNameCheck.value !== target.displayName) changes.displayName = displayNameCheck.value
    if (emailCheck.value !== target.email) changes.email = emailCheck.value
    if (statusChanged) changes.status = statusCheck.value
    if (rolesChanged) changes.roles = rolesCheck.value
    if (nextPassword) changes.password = '已重置'

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'admin_user_update',
      entityType: 'admin_user',
      entityId: userId,
      ipDigest: getIpDigest(event),
      note: `修改后台账号 ${target.username}`,
      before: { displayName: target.displayName, email: target.email, status: target.status, roles: target.roles },
      after: changes,
    })

    return { data: { id: userId, roles: rolesCheck.value, status: statusCheck.value } }
  } catch (error) {
    console.error('[admin-users] 修改账号失败', error)
    return fail(event, 500, 'USER_UPDATE_FAILED', '账号修改失败，请稍后重试')
  }
})
