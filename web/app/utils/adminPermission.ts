import type { AdminUser, UserRole } from '../types/admin'

/**
 * 后台内容页的角色判定（纯函数，不依赖 Nuxt 运行时，也不 import `web/server/**`）。
 *
 * 权限矩阵（契约 task7 §权限码）：
 *   - admin  ：`*`，内容读写 + 账号管理；
 *   - editor ：内容读写，无账号管理；
 *   - viewer ：只有各域 `:read`，**不能**新增 / 修改 / 归档内容。
 *
 * 前端判定只用于「禁用按钮并给出中文说明」，权威鉴权始终在服务端接口；
 * 这里绝不把「前端认为有权限」当成真正的授权。
 */

/** 具备内容写权限的角色。 */
export const CONTENT_WRITE_ROLES: readonly UserRole[] = Object.freeze(['admin', 'editor'])

/** viewer（或无有效角色）看到写操作控件时展示的说明。 */
export const READ_ONLY_NOTICE = '当前账号为只读角色，无法修改内容'

/**
 * 是否可能写入内容。
 *
 * 角色列表未知（未加载出会话）时返回 false：宁可先禁用按钮，
 * 也不要让只读角色看到一个能点、点了必然 403 的按钮。
 */
export function canWriteContent(user: AdminUser | null | undefined): boolean {
  const roles = user?.roles
  if (!Array.isArray(roles)) return false
  return roles.some(role => CONTENT_WRITE_ROLES.includes(role))
}

/** 「当前账号是否只读」：仅用于展示说明文案。 */
export function isReadOnlyViewer(user: AdminUser | null | undefined): boolean {
  const roles = user?.roles
  if (!Array.isArray(roles) || roles.length === 0) return true
  return !canWriteContent(user)
}
