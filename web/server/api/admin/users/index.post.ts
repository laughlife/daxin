// POST /api/admin/users
//
// 新建后台账号（仅 admin：admin:user:write）。
//   - 用户名唯一，冲突返回 409；
//   - 密码策略复用 auth/password.ts 的 hashPassword（scrypt）与长度限制，
//     明文密码只存在于请求内存，绝不写日志、绝不回显；
//   - 角色必须是已知角色且至少一个；
//   - 审计 action：admin_user_create，note 与 after 均不含密码。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#server/utils/auth/password'
import { adminAuthError, executeWrite, fail, isDuplicateKeyError, readAdminBody, writeAuditSafely } from '#server/utils/admin/http'
import {
  replaceUserRoles,
  validateDisplayName,
  validateEmail,
  validateRoles,
  validateStatus,
  validateUsername,
} from '#server/utils/admin/user-queries'

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'admin:user:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号无权重创建后台账号')
  }

  const body = await readAdminBody(event)

  const usernameCheck = validateUsername(body.username)
  if (!usernameCheck.ok) return fail(event, 400, 'INVALID_USERNAME', usernameCheck.message)

  const displayNameCheck = validateDisplayName(body.displayName)
  if (!displayNameCheck.ok) return fail(event, 400, 'INVALID_DISPLAY_NAME', displayNameCheck.message)

  const emailCheck = validateEmail(body.email)
  if (!emailCheck.ok) return fail(event, 400, 'INVALID_EMAIL', emailCheck.message)

  const rolesCheck = validateRoles(body.roles)
  if (!rolesCheck.ok) return fail(event, 400, 'INVALID_ROLES', rolesCheck.message)

  const statusCheck = validateStatus(body.status ?? 'active')
  if (!statusCheck.ok) return fail(event, 400, 'INVALID_STATUS', statusCheck.message)

  // 密码只做长度校验；复杂度策略由产品决定，这里不额外发明规则
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(event, 400, 'WEAK_PASSWORD', `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`)
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return fail(event, 400, 'WEAK_PASSWORD', `密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`)
  }

  try {
    const passwordHash = await hashPassword(password)
    const result = await executeWrite(
      `INSERT INTO admin_users (username, display_name, password_hash, password_algo, email, status, created_at, updated_at)
       VALUES (?, ?, ?, 'scrypt', ?, ?, NOW(), NOW())`,
      [usernameCheck.value, displayNameCheck.value, passwordHash, emailCheck.value, statusCheck.value],
    )

    const userId = result.insertId
    await replaceUserRoles(userId, rolesCheck.value)

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'admin_user_create',
      entityType: 'admin_user',
      entityId: userId,
      ipDigest: getIpDigest(event),
      note: `新建后台账号 ${usernameCheck.value}`,
      // 注意：绝不能把 password / passwordHash 写进审计
      after: {
        username: usernameCheck.value,
        displayName: displayNameCheck.value,
        email: emailCheck.value,
        status: statusCheck.value,
        roles: rolesCheck.value,
      },
    })

    return { data: { id: userId, username: usernameCheck.value, roles: rolesCheck.value } }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail(event, 409, 'USERNAME_TAKEN', '该用户名已存在，请更换')
    }
    console.error('[admin-users] 新建账号失败', error)
    return fail(event, 500, 'USER_CREATE_FAILED', '账号创建失败，请稍后重试')
  }
})
