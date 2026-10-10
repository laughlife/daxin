import type { UserRole } from '../types/admin'

/**
 * 后台写权限的前端映射（纯函数，不 import web/server/**）。
 *
 * 用途：只读角色（viewer）进入写操作界面时，前端必须把按钮禁用并给出中文说明，
 * 而不是等接口返回 403。这里只是界面层的开关，服务端的 `requireAdmin(event, 'review:write')`
 * / `media:write` 始终是权威判断。
 *
 * 权限矩阵（见 docs/superpowers/task7-admin-contract.md）：
 *   admin / editor → 可写核验队列与媒体；viewer → 只读。
 */

/** 具备后台写能力的角色 */
export const ADMIN_WRITE_ROLES: readonly UserRole[] = ['admin', 'editor']

/** 角色集合是否包含任一允许的角色（空集合或非法值一律视为无权限） */
export function hasAnyRole(roles: readonly string[] | undefined, allowed: readonly string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.some(role => allowed.includes(role))
}

/** 是否可以确认 / 驳回核验项（对应 review:write） */
export function canWriteReview(roles: readonly string[] | undefined): boolean {
  return hasAnyRole(roles, ADMIN_WRITE_ROLES)
}

/** 是否可以上传 / 删除媒体（对应 media:write） */
export function canWriteMedia(roles: readonly string[] | undefined): boolean {
  return hasAnyRole(roles, ADMIN_WRITE_ROLES)
}

/** 核验队列的只读说明（viewer 可见） */
export const REVIEW_READ_ONLY_NOTICE =
  '当前账号是只读角色（viewer）：可以查看核验队列，但「确认」与「驳回」按钮已被禁用。'
  + '如需处理核验项，请联系管理员开通编辑（editor）权限。'

/** 媒体库的只读说明（viewer 可见） */
export const MEDIA_READ_ONLY_NOTICE =
  '当前账号是只读角色（viewer）：可以查看媒体资源，但上传与删除功能已被禁用。'
  + '如需上传或删除文件，请联系管理员开通编辑（editor）权限。'
