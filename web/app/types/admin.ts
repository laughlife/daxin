/**
 * 后台（/admin）前端类型定义。
 *
 * 注意：这里只描述接口返回的数据形状，权限与鉴权的权威判断仍在服务端，
 * 前端仅用于展示与路由拦截。
 */

/** 后台角色编码 */
export type UserRole = 'admin' | 'editor' | 'viewer'

/** 当前登录的后台用户（对应 GET /api/admin/me 的 data.user） */
export interface AdminUser {
  id: number
  username: string
  /** 展示名称 */
  displayName: string
  email: string
  /** 账号状态，例如 active / disabled */
  status: string
  roles: UserRole[]
}
