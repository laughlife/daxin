// 后台 Session 持久化。
//
// 安全约定：
//   - 数据库只保存令牌的 SHA-256（admin_sessions.token_hash），原始令牌仅在 Cookie 中出现；
//   - ip_digest 只保存 IP 摘要，不落原始 IP；
//   - 过期时间由服务端 expires_at 决定，Cookie 的 Max-Age 只是浏览器侧提示。
import { createHash } from 'node:crypto'
import { queryTarget } from '../db/query'
import { computeExpiresAt, DEFAULT_SESSION_TTL_SECONDS, hashSessionToken } from './session'

export type CreateAdminSessionInput = {
  userId: number
  /** 原始令牌，入库前会转换为 SHA-256。 */
  token: string
  /** 客户端原始 IP；入库前统一摘要，空值写空串。 */
  ip: string
  userAgent?: string
  ttlSeconds?: number
}

export type AdminSession = {
  sessionId: number
  userId: number
  expiresAt: Date
  revokedAt: Date | null
}

/**
 * IP 摘要：SHA-256 十六进制，空 IP 返回空串。
 * 必须与 context.ts 的 getIpDigest 保持一致，全站只使用这一个实现。
 */
export function digestIp(ip: string): string {
  const value = String(ip ?? '').trim()
  if (!value) return ''
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

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

/** 写入一条 Session 记录（只写令牌哈希），返回服务端过期时间。 */
export async function createAdminSession({
  userId,
  token,
  ip,
  userAgent = '',
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
}: CreateAdminSessionInput): Promise<{ expiresAt: Date }> {
  const expiresAt = computeExpiresAt(new Date(), ttlSeconds)
  await queryTarget(
    `INSERT INTO admin_sessions (user_id, token_hash, ip_digest, user_agent, expires_at, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [userId, hashSessionToken(token), digestIp(ip), String(userAgent ?? '').slice(0, 255), expiresAt],
  )
  return { expiresAt }
}

/** 按原始令牌查找 Session；令牌为空或不存在时返回 null。 */
export async function findSessionByToken(token: string): Promise<AdminSession | null> {
  if (!token) return null
  const rows = await queryTarget<{
    id: number | string | null
    user_id: number | string | null
    expires_at: Date | string | null
    revoked_at: Date | string | null
  }>(
    'SELECT id, user_id, expires_at, revoked_at FROM admin_sessions WHERE token_hash = ? LIMIT 1',
    [hashSessionToken(token)],
  )
  const row = rows[0]
  if (!row) return null
  return {
    sessionId: toNumber(row.id),
    userId: toNumber(row.user_id),
    // 无法解析的时间按 epoch 处理，等价于已过期。
    expiresAt: toDateOrNull(row.expires_at) ?? new Date(0),
    revokedAt: toDateOrNull(row.revoked_at),
  }
}

/** 撤销 Session；返回是否真的更新了一行（重复撤销返回 false）。 */
export async function revokeSession(token: string): Promise<boolean> {
  if (!token) return false
  const result = await queryTarget(
    'UPDATE admin_sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [hashSessionToken(token)],
  )
  return affectedRows(result) > 0
}

/** 刷新最近活跃时间。 */
export async function touchSession(sessionId: number): Promise<void> {
  await queryTarget('UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = ?', [sessionId])
}

/** 清理已过期或已撤销的 Session，返回删除行数。 */
export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const result = await queryTarget(
    'DELETE FROM admin_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL',
    [now],
  )
  return affectedRows(result)
}

/**
 * 取写入语句的影响行数。
 * mysql2 的 write 结果不是行数组而是 ResultSetHeader，而 queryTarget 的返回类型是按行数组声明的，
 * 因此这里统一做一次运行时收窄。
 */
function affectedRows(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const value = (result as { affectedRows?: unknown }).affectedRows
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
