import type { AdminUser } from '~/types/admin'

/**
 * 后台会话状态（模块级共享，基于 Nuxt useState，SSR 安全）。
 *
 * 登录成功后服务端写入 HttpOnly Cookie `daxin_admin_session`，前端读不到令牌，
 * 因此会话状态的唯一来源是 GET /api/admin/me：登录成功后写入返回值，
 * 停止登录时清空为 null（load() 同样把 401 视为未登录而不是错误）。
 */

/** 判断是否为带 statusCode 的 $fetch 错误 */
function isFetchError(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  )
}

/** 未知异常统一转成可直接展示的提示文案 */
export function resolveAdminErrorMessage(error: unknown): string {
  if (isFetchError(error)) {
    if (error.statusCode === 401) return '用户名或密码错误'
    if (error.statusCode === 429) {
      const payload = error as { retryAfterSeconds?: unknown }
      const seconds = Number(payload.retryAfterSeconds)
      return Number.isFinite(seconds) && seconds > 0
        ? `登录尝试过于频繁，请在 ${seconds} 秒后重试`
        : '登录尝试过于频繁，请稍后重试'
    }
    if (error.statusCode === 403) return '该账号没有后台访问权限，请联系管理员'
    if (error.statusCode >= 500) return '服务器暂时不可用，请稍后重试'
  }
  return '网络异常，请检查网络后重试'
}

export function useAdminSession() {
  /**
   * 会话接口必须使用 useRequestFetch：
   * SSR 期间对 /api/admin/** 的相对请求需要转发用户请求头（含 HttpOnly 会话 Cookie），
   * 否则服务端拿不到登录态，已登录用户会在首屏被误判为未登录；
   * 客户端它等价于普通 $fetch。
   */
  const requestFetch = useRequestFetch()

  /** 当前登录用户；null 表示未登录 */
  const user = useState<AdminUser | null>('admin:user', () => null)
  /** 是否正在请求会话相关接口 */
  const pending = useState<boolean>('admin:pending', () => false)
  /** 是否已完成过一次 /api/admin/me 探测 */
  const initialized = useState<boolean>('admin:initialized', () => false)

  /** 是否已登录 */
  const isAuthenticated = computed(() => Boolean(user.value))

  /**
   * 读取当前会话；401 视为未登录（不抛错）。
   * @param force 为 true 时即使已初始化也重新请求
   */
  async function load(force = false): Promise<AdminUser | null> {
    if (initialized.value && !force) return user.value
    if (pending.value && !force) return user.value

    pending.value = true
    try {
      const response = await requestFetch<{ data: { user: AdminUser } }>('/api/admin/me')
      user.value = response?.data?.user ?? null
    } catch (error) {
      if (isFetchError(error) && error.statusCode === 401) {
        user.value = null
      } else {
        // 5xx / 网络异常时不当作“已登录”，但也不清空已有用户，避免瞬时故障踢出登录
        console.warn('[admin] 会话状态获取失败', error)
      }
    } finally {
      initialized.value = true
      pending.value = false
    }
    return user.value
  }

  /** 登录；成功返回用户，失败抛出可识别的错误交由页面展示 */
  async function login(
    username: string,
    password: string,
    remember = false
  ): Promise<AdminUser> {
    pending.value = true
    try {
      const response = await requestFetch<{ data: { user: AdminUser } }>('/api/admin/login', {
        method: 'POST',
        body: { username, password, remember }
      })
      user.value = response.data.user
      initialized.value = true
      return response.data.user
    } finally {
      pending.value = false
    }
  }

  /** 退出登录；无论接口是否成功都清空本地状态 */
  async function logout(): Promise<void> {
    pending.value = true
    try {
      await requestFetch('/api/admin/logout', { method: 'POST' })
    } catch (error) {
      console.warn('[admin] 退出登录接口调用失败', error)
    } finally {
      user.value = null
      initialized.value = true
      pending.value = false
    }
  }

  return { user, pending, initialized, isAuthenticated, load, login, logout }
}
