import type { AdminUser } from '~/types/admin'

/**
 * /admin 路由拦截中间件（命名中间件，页面通过 definePageMeta({ middleware: 'admin' }) 启用）。
 *
 * 行为：
 * 1. 服务端与客户端都会执行；先通过 useAdminSession().load() 探测会话（401 视为未登录）；
 * 2. 未登录 → 跳转 /admin/login?redirect=<原路径（含查询参数）>；
 * 3. 已登录但角色不具备目标路径权限 → 跳转 /admin。
 *
 * 访问规则表是仅为路由拦截而存在的“小型本地副本”，与 web/server 下的权威权限实现解耦，
 * 前端只做导航层面的兜底，真正的鉴权始终由接口负责。
 */

interface AdminRouteRule {
  /** 需要拦截的后台路径前缀 */
  prefix: string
  /** 允许访问的角色 */
  roles: readonly string[]
}

const ADMIN_ROUTE_RULES: readonly AdminRouteRule[] = [
  { prefix: '/admin/settings', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/articles', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/cases', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/brands', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/law-firms', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/media', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/review', roles: ['admin', 'editor', 'viewer'] },
  { prefix: '/admin/users', roles: ['admin'] }
]

/** 只有可写角色（admin / editor）才能进入的新建与编辑路径 */
const WRITE_SEGMENTS = ['/new', '/edit', '/create'] as const

/** 只读角色可以看到的后台首页与菜单分组 */
const ACCESSIBLE_ROLES = new Set(['admin', 'editor', 'viewer'])

/** 角色集合是否包含任一有效后台角色 */
function hasValidRole(roles: readonly string[] | undefined): boolean {
  return Array.isArray(roles) && roles.some((role) => ACCESSIBLE_ROLES.has(role))
}

/** 判断角色集合能否访问目标后台路径 */
function canAccessAdminPath(path: string, roles: readonly string[] | undefined): boolean {
  if (!hasValidRole(roles || [])) return false

  const roleList = roles || []
  const isWritePath = WRITE_SEGMENTS.some((segment) => path.includes(segment))
  if (isWritePath) {
    return roleList.includes('admin') || roleList.includes('editor')
  }

  const rule = ADMIN_ROUTE_RULES.find(
    (item) => path === item.prefix || path.startsWith(`${item.prefix}/`)
  )
  if (!rule) return true // /admin 首页等未列出的路径只要求登录
  return roleList.some((role) => rule.roles.includes(role))
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { load, user } = useAdminSession()
  if (!user.value) {
    await load()
  }

  const currentUser: AdminUser | null = user.value
  if (!currentUser) {
    return navigateTo(
      { path: '/admin/login', query: { redirect: to.fullPath } },
      { replace: true }
    )
  }

  if (!canAccessAdminPath(to.path, currentUser.roles)) {
    return navigateTo('/admin', { replace: true })
  }
})
