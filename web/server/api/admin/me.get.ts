// GET /api/admin/me
//
// 返回当前登录管理员；未登录统一 401 且不暴露失败细节。
import { resolveAdminSession } from '../../utils/auth/context'

export default defineEventHandler(async (event) => {
  const user = await resolveAdminSession(event)
  if (!user) {
    setResponseStatus(event, 401)
    return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
  }
  return { data: { user } }
})
