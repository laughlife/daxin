// 管理员账号查询。
//
// 约定：
//   - 密码哈希只在登录校验时取出，任何对外返回都先经过 toPublicAdmin 过滤；
//   - 角色通过 admin_user_roles 关联，一个用户多行，这里在应用层合并去重；
//   - 所有 SQL 均使用 ? 占位符。
import { queryTarget } from '../db/query'

/** 对外可见的管理员信息，不含任何凭据字段。 */
export type AdminUser = {
  id: number
  username: string
  displayName: string
  email: string
  status: string
  roles: string[]
}

/** 登录校验需要的附加字段；绝不可直接返回给接口层。 */
export type AdminUserWithPassword = AdminUser & {
  passwordHash: string
  passwordAlgo: string
  failedLoginCount: number
  lockedUntil: Date | null
}

type AdminRow = {
  id: number | string | null
  username: string | null
  display_name: string | null
  email: string | null
  status: string | null
  role_code: string | null
  password_hash?: string | null
  password_algo?: string | null
  failed_login_count?: number | string | null
  locked_until?: Date | string | null
}

// 列清单为模块内常量，不拼接任何用户输入。
// 必须显式选出 r.code AS role_code：连接后一行一个角色，collectRoles 依赖这个别名。
const PUBLIC_COLUMNS = 'u.id, u.username, u.display_name, u.email, u.status, r.code AS role_code'
const CREDENTIAL_COLUMNS = `${PUBLIC_COLUMNS}, u.password_hash, u.password_algo, u.failed_login_count, u.locked_until`
const ADMIN_JOINS = `FROM admin_users u
  LEFT JOIN admin_user_roles ur ON ur.user_id = u.id
  LEFT JOIN admin_roles r ON r.id = ur.role_id`

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/** 同一用户的多行按角色码合并去重。 */
function collectRoles(rows: AdminRow[]): string[] {
  const roles = new Set<string>()
  for (const row of rows) {
    const code = row.role_code?.trim()
    if (code) roles.add(code)
  }
  return [...roles].sort()
}

/** 按登录名查找账号，携带密码哈希供登录校验使用。 */
export async function findAdminByUsername(username: string): Promise<AdminUserWithPassword | null> {
  const rows = await queryTarget<AdminRow>(
    `SELECT ${CREDENTIAL_COLUMNS} ${ADMIN_JOINS} WHERE u.username = ? ORDER BY r.code`,
    [username],
  )
  const first = rows[0]
  if (!first) return null
  return {
    id: toNumber(first.id),
    username: first.username ?? '',
    displayName: first.display_name ?? '',
    email: first.email ?? '',
    status: first.status ?? '',
    roles: collectRoles(rows),
    passwordHash: first.password_hash ?? '',
    passwordAlgo: first.password_algo ?? '',
    failedLoginCount: toNumber(first.failed_login_count),
    lockedUntil: toDateOrNull(first.locked_until),
  }
}

/** 按主键查找账号，不读取密码哈希。 */
export async function findAdminById(id: number): Promise<AdminUser | null> {
  const rows = await queryTarget<AdminRow>(
    `SELECT ${PUBLIC_COLUMNS} ${ADMIN_JOINS} WHERE u.id = ? ORDER BY r.code`,
    [id],
  )
  const first = rows[0]
  if (!first) return null
  return {
    id: toNumber(first.id),
    username: first.username ?? '',
    displayName: first.display_name ?? '',
    email: first.email ?? '',
    status: first.status ?? '',
    roles: collectRoles(rows),
  }
}

/** 去掉密码相关字段，得到可以返回给前端的用户对象。 */
export function toPublicAdmin(user: AdminUser | AdminUserWithPassword): AdminUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    roles: [...user.roles],
  }
}
