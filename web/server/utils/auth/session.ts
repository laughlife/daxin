// 后台 Session 令牌与 Cookie。
//
// 安全约定：
//   - 令牌只以 SHA-256 哈希写入 admin_sessions.token_hash，数据库泄漏也无法直接复用；
//   - Cookie 使用 HttpOnly + SameSite=Lax，生产环境加 Secure；
//   - 过期时间由服务端 expires_at 控制，Cookie 的 Max-Age 只是浏览器侧提示。
import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'daxin_admin_session'

/** 默认 8 小时有效期，覆盖一个工作班次。 */
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60

/** 记住登录时的上限，避免长期有效令牌。 */
export const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/** 生成 32 字节随机令牌，使用 URL 安全编码。 */
export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

/** 令牌哈希：入库与比对都只使用该值。 */
export function hashSessionToken(token) {
  return createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex')
}

/** 计算过期时间点；ttl 会被限制在允许范围内。 */
export function computeExpiresAt(now = new Date(), ttlSeconds = DEFAULT_SESSION_TTL_SECONDS) {
  const base = now instanceof Date ? now : new Date(now)
  const bounded = Math.min(Math.max(Math.floor(ttlSeconds), 60), MAX_SESSION_TTL_SECONDS)
  return new Date(base.getTime() + bounded * 1000)
}

/** 是否已过期；到期瞬间即视为失效。 */
export function isSessionExpired(expiresAt, now = new Date()) {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return true
  const reference = now instanceof Date ? now : new Date(now)
  return expiry.getTime() <= reference.getTime()
}

/** Session 是否仍然可用：未过期且未被撤销。 */
export function isSessionActive(session, now = new Date()) {
  if (!session) return false
  if (session.revokedAt || session.revoked_at) return false
  const expiresAt = session.expiresAt ?? session.expires_at
  return !isSessionExpired(expiresAt, now)
}

/**
 * 生成 Set-Cookie 值。
 * maxAgeSeconds 为 0 时输出清除 Cookie 的写法。
 */
export function buildSessionCookie(token, { maxAgeSeconds = DEFAULT_SESSION_TTL_SECONDS, secure = false, path = '/' } = {}) {
  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(String(token ?? ''))}`]
  parts.push(`Path=${path}`)
  parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`)
  parts.push('HttpOnly')
  parts.push('SameSite=Lax')
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** 从 Cookie 头解析 Session 令牌；缺失返回空串。 */
export function parseSessionCookie(cookieHeader) {
  const header = String(cookieHeader ?? '')
  if (!header) return ''
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=')
    if (separator === -1) continue
    const name = segment.slice(0, separator).trim()
    if (name !== SESSION_COOKIE_NAME) continue
    const value = segment.slice(separator + 1).trim()
    if (!value) return ''
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return ''
}

/** 登录限速参数：窗口内失败达到上限即锁定。 */
export const LOGIN_RATE_LIMIT = Object.freeze({
  windowSeconds: 15 * 60,
  maxFailures: 5,
  lockSeconds: 15 * 60,
})
