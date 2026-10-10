import type { AdminUser, UserRole } from '../types/admin'

/**
 * 后台角色判定的唯一入口（纯函数，不依赖 Nuxt 运行时，也不 import `web/server/**`）。
 *
 * 为什么集中在一个文件：这些判定原先散在 adminPermission.ts / adminPermissions.ts /
 * adminAccess.ts 三个文件里，各自复制了一份「admin|editor 可写」的规则，并且入参类型还不一致
 * （一个收 AdminUser、两个收 roles）。同一个角色矩阵有多份副本，必然会出现一边改了另一边没改
 * 的漂移，而且同名导出常量还会触发 Nuxt 自动导入冲突。现在只保留本文件。
 *
 * 权限矩阵（web/server/utils/auth/permissions.ts 与 docs/superpowers/task7-admin-contract.md）：
 *   - admin  ：`*`，全部读写 + 账号管理；
 *   - editor ：内容 / 媒体 / 配置 / 核验的读写，**无**账号管理；
 *   - viewer ：只有各域 `:read`，不能新增 / 修改 / 归档 / 上传 / 删除。
 *
 * 重要：前端判定只用于「把控件禁用并给出中文说明」，让只读角色看不到能点却必然 403 的按钮。
 * 权威鉴权始终在服务端 `requireAdmin(event, '<permission>')`，这里绝不作为授权依据。
 */

/** 具备内容 / 媒体 / 配置 / 核验写能力的角色。 */
export const ADMIN_WRITE_ROLES: readonly UserRole[] = Object.freeze(['admin', 'editor'])

/** 仅管理员：账号与角色管理。 */
export const ADMIN_ONLY_ROLES: readonly UserRole[] = Object.freeze(['admin'])

/** 角色集合是否包含任一允许的角色；空集合、未加载或非法值一律视为无权限。 */
export function hasAnyRole(roles: readonly string[] | undefined, allowed: readonly string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.some((role) => allowed.includes(role))
}

/**
 * 从会话用户对象或角色数组归一化出角色列表。
 * 兼容两种调用方式（历史上分别存在），避免调用方各自判断。
 */
function toRoles(source: AdminUser | readonly string[] | null | undefined): readonly string[] {
  if (!source) return []
  if (Array.isArray(source)) return source
  const roles = (source as AdminUser).roles
  return Array.isArray(roles) ? roles : []
}

/** 是否可写内容（文章 / 案例 / 品牌 / 律所）。 */
export function canWriteContent(source: AdminUser | readonly string[] | null | undefined): boolean {
  return hasAnyRole(toRoles(source), ADMIN_WRITE_ROLES)
}

/** 是否可写站点配置（站点 / 首页 / 关于 / SEO / 业务板块 / 页脚）。 */
export function canWriteSettings(source: AdminUser | readonly string[] | null | undefined): boolean {
  return hasAnyRole(toRoles(source), ADMIN_WRITE_ROLES)
}

/** 是否可写核验队列（确认 / 驳回）。 */
export function canWriteReview(source: AdminUser | readonly string[] | null | undefined): boolean {
  return hasAnyRole(toRoles(source), ADMIN_WRITE_ROLES)
}

/** 是否可上传 / 删除媒体。 */
export function canWriteMedia(source: AdminUser | readonly string[] | null | undefined): boolean {
  return hasAnyRole(toRoles(source), ADMIN_WRITE_ROLES)
}

/** 是否可管理后台账号（仅 admin）。 */
export function canManageAdminUsers(source: AdminUser | readonly string[] | null | undefined): boolean {
  return hasAnyRole(toRoles(source), ADMIN_ONLY_ROLES)
}

/** 「当前账号是否只读」：仅用于展示说明文案；会话未加载时按只读处理。 */
export function isReadOnlyViewer(source: AdminUser | readonly string[] | null | undefined): boolean {
  return !canWriteContent(source)
}

/** 只读说明文案：各页面按语境选用，语义一致。 */
export const READ_ONLY_NOTICE = '当前账号为只读角色，无法修改内容'

export const SETTINGS_READ_ONLY_NOTICE = '当前账号为只读角色，无法保存修改'

export const REVIEW_READ_ONLY_NOTICE =
  '当前账号是只读角色（viewer）：可以查看核验队列，但「确认」与「驳回」按钮已被禁用。'
  + '如需处理核验项，请联系管理员开通编辑（editor）权限。'

export const MEDIA_READ_ONLY_NOTICE =
  '当前账号是只读角色（viewer）：可以查看媒体资源，但上传与删除功能已被禁用。'
  + '如需上传或删除文件，请联系管理员开通编辑（editor）权限。'

/**
 * 生成不与已有值冲突的 slug，形如 `<prefix>-<n>`，从 1 开始。
 *
 * 用于后台新增子项：中文标题无法可靠音译，而留空会让服务端按数组下标兜底，
 * 一次新增多项时互相覆盖。比对大小写不敏感（slug 在服务端按不区分大小写比较）。
 */
export function nextUniqueSlug(prefix: string, used: Iterable<string>): string {
  const taken = new Set<string>()
  for (const value of used) {
    if (typeof value === 'string' && value) taken.add(value.toLowerCase())
  }
  let index = 1
  let candidate = `${prefix}-${index}`
  while (taken.has(candidate.toLowerCase())) {
    index += 1
    candidate = `${prefix}-${index}`
  }
  return candidate
}
