// GET /api/admin/users
//
// 后台账号列表（仅 admin：admin:user:read）。
//   - 返回用户名、显示名、邮箱、状态、角色与最近登录时间；
//   - 绝不返回 password_hash / password_algo 等凭据字段；
//   - 支持关键词（用户名 / 显示名 / 邮箱）、角色、状态筛选；
//   - 账号量级很小（个位数），因此不做分页，一次性返回并按 id 升序。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { requireAdmin, getIpDigest } from '#server/utils/auth/context'
import { ROLE_CODES } from '#server/utils/auth/permissions'
import { queryTarget } from '#server/utils/db/query'
import { adminAuthError, fail } from '#server/utils/admin/http'

/** 角色码白名单，用于过滤非法的 role 查询参数。 */
const VALID_ROLES = new Set<string>(ROLE_CODES)

const VALID_STATUS = new Set(['active', 'disabled'])

interface AdminUserListRow {
  id: number | string | null
  username: string | null
  display_name: string | null
  email: string | null
  status: string | null
  role_code: string | null
  last_login_at: Date | string | null
  created_at: Date | string | null
}

/** 审计日志的实体类型（写操作在其它端点，这里仅用于类型一致）。 */
export type { AdminUser }

function toNumber(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 日期统一输出为 YYYY-MM-DD HH:mm:ss（与其它后台列表口径一致）。 */
function toDateTimeText(value: Date | string | null): string {
  if (!value) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} `
      + `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  return String(value).replace('T', ' ').replace(/\.\d+Z?$/, '')
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'admin:user:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号无权重查看后台账号')
  }

  const query = getQuery(event)
  const keyword = String(query.keyword ?? '').trim().slice(0, 64)
  const role = String(query.role ?? '').trim().toLowerCase()
  const status = String(query.status ?? '').trim().toLowerCase()

  if (role && !VALID_ROLES.has(role)) {
    return fail(event, 400, 'INVALID_ROLE', '角色筛选值不合法')
  }
  if (status && !VALID_STATUS.has(status)) {
    return fail(event, 400, 'INVALID_STATUS', '状态筛选值只能是 active 或 disabled')
  }

  const conditions: string[] = []
  const params: unknown[] = []

  if (keyword) {
    conditions.push(`(u.username LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')`)
    const like = `%${keyword.replace(/[!%_]/g, char => `!${char}`)}%`
    params.push(like, like, like)
  }
  if (status) {
    conditions.push('u.status = ?')
    params.push(status)
  }
  if (role) {
    // 角色过滤放在最后：先按角色筛出用户 id，避免 JOIN 后条件把同一用户的其它角色行也过滤掉
    conditions.push('u.id IN (SELECT ur2.user_id FROM admin_user_roles ur2 JOIN admin_roles r2 ON r2.id = ur2.role_id WHERE r2.code = ?)')
    params.push(role)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const rows = await queryTarget<AdminUserListRow>(
      `SELECT u.id, u.username, u.display_name, u.email, u.status, u.last_login_at, u.created_at,
        r.code AS role_code
       FROM admin_users u
       LEFT JOIN admin_user_roles ur ON ur.user_id = u.id
       LEFT JOIN admin_roles r ON r.id = ur.role_id
       ${where}
       ORDER BY u.id ASC, r.code ASC`,
      params,
    )

    // 同一用户的多行合并角色；保持 id 升序
    const byId = new Map<number, { id: number, username: string, displayName: string, email: string, status: string, roles: string[], lastLoginAt: string, createdAt: string }>()
    for (const row of rows) {
      const id = toNumber(row.id)
      const existing = byId.get(id)
      const code = String(row.role_code ?? '').trim()
      if (existing) {
        if (code && !existing.roles.includes(code)) existing.roles.push(code)
        continue
      }
      byId.set(id, {
        id,
        username: String(row.username ?? ''),
        displayName: String(row.display_name ?? ''),
        email: String(row.email ?? ''),
        status: String(row.status ?? ''),
        roles: code ? [code] : [],
        lastLoginAt: toDateTimeText(row.last_login_at),
        createdAt: toDateTimeText(row.created_at),
      })
    }

    const items = [...byId.values()].map(item => ({ ...item, roles: item.roles.sort() }))
    return { data: items, meta: { total: items.length } }
  } catch (error) {
    console.error('[admin-users] 查询账号列表失败', error)
    return fail(event, 500, 'USERS_QUERY_FAILED', '账号列表加载失败，请稍后重试')
  }
})
