// 请求上下文与登录态解析。
//
// 约定：
//   - 对外只暴露 IP 摘要（SHA-256），原始 IP 仅在本模块内短暂使用，不落库、不进日志；
//   - resolveAdminSession 对“未登录”“Session 失效”“账号停用”一律返回 null，不抛异常；
//   - requireAdmin 用于需要强制登录/权限的接口，缺登录抛 401，缺权限由 requirePermission 抛 403。
import { createError, type H3Event } from 'h3'
import { isSessionActive, parseSessionCookie } from './session'
import { digestIp, findSessionByToken, touchSession } from './session-store'
import { findAdminById, toPublicAdmin, type AdminUser } from './admin-user'
import { requirePermission } from './permissions'

/** IPv6 最长 45 字符，留出余量；与 ip_digest VARCHAR(64) 对齐。 */
const MAX_IP_LENGTH = 64

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim()
  return String(value ?? '').trim()
}

/** 客户端 IP：优先 x-forwarded-for 首跳，其次 x-real-ip，最后 socket 远端地址。 */
export function getClientIp(event: H3Event): string {
  const headers = event.node.req.headers as Record<string, string | string[] | undefined>
  const forwarded = firstHeaderValue(headers['x-forwarded-for']).split(',')[0]?.trim() ?? ''
  if (forwarded) return forwarded.slice(0, MAX_IP_LENGTH)
  const realIp = firstHeaderValue(headers['x-real-ip'])
  if (realIp) return realIp.slice(0, MAX_IP_LENGTH)
  const remote = String(event.node.req.socket?.remoteAddress ?? '').trim()
  return remote.slice(0, MAX_IP_LENGTH)
}

/** IP 摘要；算法与 session-store.digestIp 完全一致（同一实现）。 */
export function getIpDigest(event: H3Event): string {
  return digestIp(getClientIp(event))
}

/** 从 Cookie 读取 Session 令牌；缺失返回空串。 */
export function getSessionToken(event: H3Event): string {
  return parseSessionCookie(event.node.req.headers.cookie)
}

/**
 * 解析当前请求的管理员登录态。
 * 任何一步不满足（无令牌、Session 不存在/过期/已撤销、账号不存在/停用）都返回 null。
 */
export async function resolveAdminSession(event: H3Event): Promise<AdminUser | null> {
  try {
    const token = getSessionToken(event)
    if (!token) return null

    const session = await findSessionByToken(token)
    if (!session) return null
    if (!isSessionActive({ expiresAt: session.expiresAt, revokedAt: session.revokedAt })) return null

    const user = await findAdminById(session.userId)
    if (!user || user.status !== 'active') return null

    await touchSession(session.sessionId)
    return toPublicAdmin(user)
  } catch (error) {
    console.error('[admin-auth] 解析登录态失败', error)
    return null
  }
}

/** 要求已登录；传入 permission 时进一步要求权限。 */
export async function requireAdmin(event: H3Event, permission?: string): Promise<AdminUser> {
  const user = await resolveAdminSession(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: '未登录或登录已失效' })
  }
  if (permission) requirePermission(user.roles, permission)
  return user
}
