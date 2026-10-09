// 后台登录限速。
//
// 两道限制同时生效：
//   1. admin_login_attempts：窗口期内按“登录名或 IP 摘要”统计失败次数，达到上限即拒登；
//   2. admin_users.locked_until：连续失败达到上限时给账号本身打上锁定时间。
// 登录接口先调用 isLoginLocked，再校验密码，避免锁定期间仍然消耗 scrypt 计算。
import { queryTarget, withTargetTransaction } from '../db/query'
import { LOGIN_RATE_LIMIT } from './session'

export type LoginAttemptInput = {
  username: string
  ipDigest: string
  succeeded: boolean
  reason?: string
}

export type LoginLockInput = {
  username: string
  ipDigest: string
}

export type RecentFailureQuery = {
  username: string
  ipDigest: string
  since: Date
}

const REASON_MAX_LENGTH = 64

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

/** 记录一次登录尝试（成功与失败都记录，用于限速与审计）。 */
export async function recordLoginAttempt({
  username,
  ipDigest,
  succeeded,
  reason = '',
}: LoginAttemptInput): Promise<void> {
  await queryTarget(
    `INSERT INTO admin_login_attempts (username, ip_digest, succeeded, reason, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [
      String(username ?? '').slice(0, 64),
      String(ipDigest ?? '').slice(0, 64),
      succeeded ? 1 : 0,
      String(reason ?? '').slice(0, REASON_MAX_LENGTH),
    ],
  )
}

/** 统计窗口内失败次数：登录名命中或同一 IP 摘要命中都计入。 */
export async function countRecentFailures({ username, ipDigest, since }: RecentFailureQuery): Promise<number> {
  const rows = await queryTarget<{ total: number | string | null }>(
    `SELECT COUNT(*) AS total FROM admin_login_attempts
     WHERE succeeded = 0 AND created_at >= ? AND (username = ? OR ip_digest = ?)`,
    [since, username, ipDigest],
  )
  return toNumber(rows[0]?.total)
}

/**
 * 是否处于锁定状态。
 * 账号级 locked_until 优先；否则按窗口内失败次数与 LOGIN_RATE_LIMIT 判断。
 */
export async function isLoginLocked({ username, ipDigest }: LoginLockInput): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const now = new Date()
  const userRows = await queryTarget<{ locked_until: Date | string | null }>(
    'SELECT locked_until FROM admin_users WHERE username = ? LIMIT 1',
    [username],
  )
  const lockedUntil = toDateOrNull(userRows[0]?.locked_until)
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
    }
  }

  const since = new Date(now.getTime() - LOGIN_RATE_LIMIT.windowSeconds * 1000)
  const failures = await countRecentFailures({ username, ipDigest, since })
  if (failures >= LOGIN_RATE_LIMIT.maxFailures) {
    return { locked: true, retryAfterSeconds: LOGIN_RATE_LIMIT.lockSeconds }
  }
  return { locked: false, retryAfterSeconds: 0 }
}

/**
 * 登记一次失败：failed_login_count 加一，达到上限时写入 locked_until。
 * 账号不存在时更新 0 行，返回 lockedUntil 为 null。
 */
export async function registerFailedLogin(username: string): Promise<{ lockedUntil: Date | null }> {
  const lockedUntil = new Date(Date.now() + LOGIN_RATE_LIMIT.lockSeconds * 1000)
  return withTargetTransaction(async (connection) => {
    await connection.execute(
      `UPDATE admin_users
       SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= ? THEN ? ELSE locked_until END,
           updated_at = NOW()
       WHERE username = ?`,
      [LOGIN_RATE_LIMIT.maxFailures, lockedUntil, username],
    )
    const [rows] = await connection.execute(
      'SELECT locked_until FROM admin_users WHERE username = ? LIMIT 1',
      [username],
    )
    const row = Array.isArray(rows) ? (rows[0] as { locked_until?: Date | string | null } | undefined) : undefined
    return { lockedUntil: toDateOrNull(row?.locked_until) }
  })
}

/** 登录成功后清零失败计数与锁定时间。 */
export async function resetFailedLogin(username: string): Promise<void> {
  await queryTarget(
    `UPDATE admin_users
     SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
     WHERE username = ?`,
    [username],
  )
}
