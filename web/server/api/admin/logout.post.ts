// POST /api/admin/logout
//
// 约定：无 Session 时也必须安全返回（只清 Cookie），不能抛错影响前端跳转。
import { SESSION_COOKIE_NAME } from '../../utils/auth/session'
import { findSessionByToken, revokeSession } from '../../utils/auth/session-store'
import { findAdminById } from '../../utils/auth/admin-user'
import { writeAuditLog } from '../../utils/auth/audit'
import { getIpDigest, getSessionToken } from '../../utils/auth/context'

async function writeLogoutAudit(userId: number, ipDigest: string): Promise<void> {
  try {
    const user = await findAdminById(userId)
    await writeAuditLog({
      userId,
      username: user?.username ?? '',
      action: 'logout',
      entityType: 'admin_user',
      entityId: userId,
      ipDigest,
      note: '管理员退出登录',
    })
  } catch (error) {
    // 审计写入失败不影响退出流程。
    console.error('[admin-logout] 写入审计日志失败', error)
  }
}

export default defineEventHandler(async (event) => {
  try {
    const token = getSessionToken(event)
    if (token) {
      const session = await findSessionByToken(token)
      const revoked = await revokeSession(token)
      if (session && revoked) await writeLogoutAudit(session.userId, getIpDigest(event))
    }
  } catch (error) {
    console.error('[admin-logout] 撤销会话失败', error)
  } finally {
    setCookie(event, SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
  }

  return { data: { ok: true } }
})
