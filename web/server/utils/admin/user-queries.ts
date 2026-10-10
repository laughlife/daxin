// 后台账号管理的共用校验与写入逻辑。
//
// 放在 utils 里而不是各端点内联，是为了让「创建」与「修改」共用同一套校验规则：
// 两处各写一份必然漂移，而账号字段（用户名、角色、状态）一旦漂移就是权限问题。
import { executeWrite } from './http'
import { ROLE_CODES } from '../auth/permissions'

/** 用户名：字母开头，允许字母、数字、下划线、连字符，3–32 位。 */
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/

/** 邮箱：够用的形态校验，不做 RFC 全量匹配。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 账号状态白名单。 */
export const ADMIN_USER_STATUSES = Object.freeze(['active', 'disabled'] as const)

const VALID_ROLES = new Set<string>(ROLE_CODES)

export const MAX_DISPLAY_NAME_LENGTH = 64
export const MAX_EMAIL_LENGTH = 191
export const MAX_USERNAME_LENGTH = 32

/** 校验用户名；不合法时返回中文原因。 */
export function validateUsername(value: unknown): { ok: true, value: string } | { ok: false, message: string } {
  const username = String(value ?? '').trim()
  if (!username) return { ok: false, message: '用户名不能为空' }
  if (username.length > MAX_USERNAME_LENGTH) return { ok: false, message: `用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符` }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, message: '用户名只能以字母开头，并由字母、数字、下划线或连字符组成（3–32 位）' }
  }
  return { ok: true, value: username }
}

/** 校验显示名。 */
export function validateDisplayName(value: unknown): { ok: true, value: string } | { ok: false, message: string } {
  const displayName = String(value ?? '').trim()
  if (!displayName) return { ok: false, message: '显示名不能为空' }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, message: `显示名不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符` }
  }
  return { ok: true, value: displayName }
}

/** 校验邮箱；允许留空。 */
export function validateEmail(value: unknown): { ok: true, value: string } | { ok: false, message: string } {
  const email = String(value ?? '').trim()
  if (!email) return { ok: true, value: '' }
  if (email.length > MAX_EMAIL_LENGTH) return { ok: false, message: `邮箱不能超过 ${MAX_EMAIL_LENGTH} 个字符` }
  if (!EMAIL_PATTERN.test(email)) return { ok: false, message: '邮箱格式不正确' }
  return { ok: true, value: email }
}

/** 校验状态。 */
export function validateStatus(value: unknown): { ok: true, value: string } | { ok: false, message: string } {
  const status = String(value ?? '').trim().toLowerCase()
  if (!(ADMIN_USER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: '状态只能是 active（启用）或 disabled（停用）' }
  }
  return { ok: true, value: status }
}

/**
 * 校验并归一化角色列表。
 * 空数组会被拒绝：没有角色的账号登录后无处可去，属于无效配置。
 */
export function validateRoles(value: unknown): { ok: true, value: string[] } | { ok: false, message: string } {
  if (!Array.isArray(value)) return { ok: false, message: '角色必须是数组' }
  const roles = new Set<string>()
  for (const item of value) {
    const code = String(item ?? '').trim().toLowerCase()
    if (!code) continue
    if (!VALID_ROLES.has(code)) return { ok: false, message: `未知角色：${code}` }
    roles.add(code)
  }
  if (roles.size === 0) return { ok: false, message: '至少需要指定一个角色' }
  return { ok: true, value: [...roles].sort() }
}

/** 覆盖式写入用户的角色关联（先删后插，保持与请求一致）。 */
export async function replaceUserRoles(userId: number, roles: readonly string[]): Promise<void> {
  await executeWrite('DELETE FROM admin_user_roles WHERE user_id = ?', [userId])
  for (const code of roles) {
    await executeWrite(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT ?, id FROM admin_roles WHERE code = ?`,
      [userId, code],
    )
  }
}

/** 统计仍然启用的 admin 角色账号数量，用于「最后一个管理员」保护。 */
export async function countActiveAdmins(): Promise<number> {
  const { queryTarget } = await import('../db/query')
  const rows = await queryTarget<{ total: number | string | null }>(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM admin_users u
     JOIN admin_user_roles ur ON ur.user_id = u.id
     JOIN admin_roles r ON r.id = ur.role_id
     WHERE r.code = 'admin' AND u.status = 'active'`,
  )
  const total = Number(rows[0]?.total ?? 0)
  return Number.isFinite(total) ? total : 0
}

/** 判断某个用户是否拥有 admin 角色（不区分状态）。 */
export async function userHasAdminRole(userId: number): Promise<boolean> {
  const { queryTarget } = await import('../db/query')
  const rows = await queryTarget<{ c: number | string | null }>(
    `SELECT COUNT(*) AS c
     FROM admin_user_roles ur
     JOIN admin_roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.code = 'admin'`,
    [userId],
  )
  return Number(rows[0]?.c ?? 0) > 0
}
