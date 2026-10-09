// 后台角色与权限。
//
// 三角色模型：
//   admin  全量权限，包含账号管理与站点设置；
//   editor 内容与媒体，可编辑文章、案例、品牌、律所、业务与媒体；
//   viewer 只读，可查看后台数据但不能写入。
//
// 权限码格式：<domain>:<action>，domain 使用单数，例如 article:write、admin:user:write。
// 通配符 '*' 表示全部权限，'<domain>:*' 表示该域全部动作。

export const ROLE_CODES = Object.freeze(['admin', 'editor', 'viewer'] as const)

/** 后台角色码。 */
export type AdminRole = (typeof ROLE_CODES)[number]

/** 带 HTTP 状态码的错误，供接口层转成 401/403。 */
export type PermissionError = Error & { statusCode: number }

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly string[]>> = Object.freeze({
  admin: ['*'],
  editor: [
    'article:read', 'article:write',
    'case:read', 'case:write',
    'brand:read', 'brand:write',
    'law_firm:read', 'law_firm:write',
    'service:read', 'service:write',
    'media:read', 'media:write',
    'settings:read', 'settings:write',
    'review:read', 'review:write',
  ],
  viewer: [
    'article:read', 'case:read', 'brand:read', 'law_firm:read',
    'service:read', 'media:read', 'settings:read', 'review:read',
  ],
})

/** 只允许 admin 的权限。 */
export const ADMIN_ONLY_PERMISSIONS = Object.freeze([
  'admin:user:read', 'admin:user:write', 'admin:audit:read', 'admin:role:write',
])

/** 各后台路径所需权限；未列出的 /admin 子路径默认要求登录。 */
export const ADMIN_PATH_PERMISSIONS = Object.freeze([
  { pattern: /^\/admin\/users(\/|$)/, permission: 'admin:user:read' },
  { pattern: /^\/admin\/users\/new(\/|$)/, permission: 'admin:user:write' },
  { pattern: /^\/admin\/audit(\/|$)/, permission: 'admin:audit:read' },
  { pattern: /^\/admin\/settings(\/|$)/, permission: 'settings:read' },
  { pattern: /^\/admin\/articles(\/|$)/, permission: 'article:read' },
  { pattern: /^\/admin\/cases(\/|$)/, permission: 'case:read' },
  { pattern: /^\/admin\/brands(\/|$)/, permission: 'brand:read' },
  { pattern: /^\/admin\/law-firms(\/|$)/, permission: 'law_firm:read' },
  { pattern: /^\/admin\/media(\/|$)/, permission: 'media:read' },
  { pattern: /^\/admin\/review(\/|$)/, permission: 'review:read' },
])

/** 只读角色禁止进入的新建/编辑路径片段。 */
const WRITE_ONLY_SEGMENTS = ['/new', '/edit', '/create']

const VALID_ROLES = new Set<string>(ROLE_CODES)

/** 把角色集合展开为权限集合，去重并过滤未知角色。 */
export function permissionsForRoles(roles: readonly string[] = []): string[] {
  const permissions = new Set<string>()
  for (const role of roles) {
    if (!VALID_ROLES.has(role)) continue
    const granted = ROLE_PERMISSIONS[role as AdminRole]
    if (!granted) continue
    for (const permission of granted) permissions.add(permission)
  }
  return [...permissions].sort()
}

function matches(granted: string, required: string): boolean {
  if (granted === '*') return true
  if (granted === required) return true
  if (granted.endsWith(':*')) {
    const domain = granted.slice(0, -2)
    return required === domain || required.startsWith(`${domain}:`)
  }
  return false
}

/** 判断角色集合是否具备某个权限。 */
export function hasPermission(roles: readonly string[], permission: string): boolean {
  if (!permission) return false
  return permissionsForRoles(roles).some((granted) => matches(granted, permission))
}

/** 构造带状态码的错误，交由接口层转成 401/403。 */
function permissionError(message: string, statusCode: number): PermissionError {
  const error = new Error(message) as PermissionError
  error.statusCode = statusCode
  return error
}

/** 缺少权限时抛出带状态码的错误，交由接口层转成 401/403。 */
export function requirePermission(roles: readonly string[], permission: string): void {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw permissionError('未登录或登录已失效', 401)
  }
  if (!hasPermission(roles, permission)) {
    throw permissionError(`缺少权限：${permission}`, 403)
  }
}

/** 登录后默认跳转路径；无角色时回到登录页。 */
export function defaultRouteForRoles(roles: readonly string[] = []): string {
  return roles.some((role) => VALID_ROLES.has(role)) ? '/admin' : '/admin/login'
}

/** 判断角色集合能否访问某个后台路径；非 /admin 路径始终允许。 */
export function canAccessPath(roles: readonly string[], path: string): boolean {
  const target = String(path ?? '/')
  if (!target.startsWith('/admin')) return true
  if (roles.length === 0) return false
  if (!roles.some((role) => VALID_ROLES.has(role))) return false

  const isWritePath = WRITE_ONLY_SEGMENTS.some((segment) => target.includes(segment))
  for (const rule of ADMIN_PATH_PERMISSIONS) {
    if (!rule.pattern.test(target)) continue
    if (isWritePath) {
      const writePermission = rule.permission.replace(':read', ':write')
      return hasPermission(roles, writePermission)
    }
    return hasPermission(roles, rule.permission)
  }
  // /admin 首页等未列出路径只要求登录。
  return true
}
