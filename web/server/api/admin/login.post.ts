// POST /api/admin/login
//
// 安全约定：
//   - 登录失败只返回同一条中文提示，不区分账号不存在 / 密码错误 / 账号停用；
//   - 限速检查先于密码校验，锁定期间直接返回 429，不消耗 scrypt 计算；
//   - Session 令牌只以 SHA-256 哈希入库，Cookie 使用 HttpOnly + SameSite=Lax，生产环境加 Secure；
//   - 密码哈希参数过低时在登录成功后平滑升级。
import {
  PASSWORD_ALGORITHM,
  hashPassword,
  needsRehash,
  verifyPassword,
  MAX_PASSWORD_LENGTH,
} from '../../utils/auth/password'
import {
  DEFAULT_SESSION_TTL_SECONDS,
  MAX_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  createSessionToken,
} from '../../utils/auth/session'
import { findAdminByUsername, toPublicAdmin, type AdminUserWithPassword } from '../../utils/auth/admin-user'
import { createAdminSession } from '../../utils/auth/session-store'
import {
  isLoginLocked,
  recordLoginAttempt,
  registerFailedLogin,
  resetFailedLogin,
} from '../../utils/auth/login-rate-limit'
import { writeAuditLog } from '../../utils/auth/audit'
import { getClientIp, getIpDigest } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import type { H3Event } from 'h3'

const MAX_USERNAME_LENGTH = 64
const MAX_USER_AGENT_LENGTH = 255
/** 统一的失败提示，避免通过文案区分账号状态。 */
const INVALID_CREDENTIALS_MESSAGE = '用户名或密码错误，或账号不可用'

/**
 * 账号不存在时仍然执行一次同参数的口令派生，使响应耗时与“密码错误”一致，
 * 避免通过响应时间枚举出哪些用户名真实存在。
 * 该哈希对应的随机口令不保存在任何地方，因此它永远不可能登录成功。
 */
const DUMMY_PASSWORD_HASH = 'scrypt$16384$8$1$IcVFAF4E+CGVecXhLAeaUg==$9tlibipTpzYL40Xv+hLgS1sPoHYsAFwOa7Xr/601cPU='

type LoginBody = {
  username: string
  password: string
  remember: boolean
}

async function readLoginBody(event: H3Event): Promise<LoginBody> {
  let body: unknown = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return {
    username: typeof record.username === 'string' ? record.username.trim() : '',
    password: typeof record.password === 'string' ? record.password : '',
    remember: record.remember === true,
  }
}

/** 仅用于内部审计，绝不返回给客户端。 */
function failureReason(user: AdminUserWithPassword | null, passwordOk: boolean): string {
  if (!user) return 'user_not_found'
  if (user.status !== 'active') return 'user_disabled'
  return passwordOk ? 'unknown' : 'bad_password'
}

/** 哈希参数落后或算法变更时，用本次提交的明文密码重新生成哈希。 */
async function rehashPasswordIfNeeded(userId: number, password: string, currentHash: string): Promise<void> {
  if (!needsRehash(currentHash)) return
  try {
    const hash = await hashPassword(password)
    await queryTarget(
      'UPDATE admin_users SET password_hash = ?, password_algo = ?, updated_at = NOW() WHERE id = ?',
      [hash, PASSWORD_ALGORITHM, userId],
    )
  } catch (error) {
    // 哈希升级失败不影响本次登录。
    console.error('[admin-login] 重新哈希密码失败', error)
  }
}

async function writeLoginAudit(userId: number, username: string, ipDigest: string): Promise<void> {
  try {
    await writeAuditLog({
      userId,
      username,
      action: 'login',
      entityType: 'admin_user',
      entityId: userId,
      ipDigest,
      note: '管理员登录成功',
    })
  } catch (error) {
    // 审计写入失败不影响本次登录。
    console.error('[admin-login] 写入审计日志失败', error)
  }
}

export default defineEventHandler(async (event) => {
  const { username, password, remember } = await readLoginBody(event)
  if (!username || !password || username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_INPUT', message: '请输入正确的用户名和密码' } }
  }

  const ip = getClientIp(event)
  const ipDigest = getIpDigest(event)
  const userAgent = String(getRequestHeader(event, 'user-agent') ?? '').slice(0, MAX_USER_AGENT_LENGTH)

  const lock = await isLoginLocked({ username, ipDigest })
  if (lock.locked) {
    setResponseStatus(event, 429)
    setResponseHeader(event, 'Retry-After', lock.retryAfterSeconds)
    return {
      error: {
        code: 'RATE_LIMITED',
        message: `登录失败次数过多，请在 ${Math.max(1, Math.ceil(lock.retryAfterSeconds / 60))} 分钟后重试`,
        retryAfterSeconds: lock.retryAfterSeconds,
      },
    }
  }

  const user = await findAdminByUsername(username)
  // 账号不存在时也走一次校验，保持与“密码错误”相同的耗时。
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
  if (!user || !passwordOk || user.status !== 'active') {
    await recordLoginAttempt({ username, ipDigest, succeeded: false, reason: failureReason(user, passwordOk) })
    await registerFailedLogin(username)
    setResponseStatus(event, 401)
    return { error: { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE } }
  }

  await resetFailedLogin(username)
  await recordLoginAttempt({ username, ipDigest, succeeded: true, reason: 'ok' })

  const ttlSeconds = remember ? MAX_SESSION_TTL_SECONDS : DEFAULT_SESSION_TTL_SECONDS
  const token = createSessionToken()
  const { expiresAt } = await createAdminSession({ userId: user.id, token, ip, userAgent, ttlSeconds })

  // 与 ip_digest 保持一致：last_login_ip 也只写摘要，不落原始 IP。
  await queryTarget(
    'UPDATE admin_users SET last_login_at = NOW(), last_login_ip = ?, updated_at = NOW() WHERE id = ?',
    [ipDigest, user.id],
  )
  await rehashPasswordIfNeeded(user.id, password, user.passwordHash)
  await writeLoginAudit(user.id, user.username, ipDigest)

  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttlSeconds,
  })

  return {
    data: {
      user: toPublicAdmin(user),
      expiresAt: expiresAt.toISOString(),
    },
  }
})
