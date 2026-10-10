import { fetchSettings, type PublicSettings } from '~/repositories/settings'

/**
 * 站点配置的共享读取。
 *
 * Header、Footer、关于我们页都需要同一份 `/api/public/settings`。
 * 三处各自调用 `useAsyncData('...', () => fetchSettings())` 会因为 handler 是**不同的函数实例**
 * 而触发 Nuxt 的 NUXT_E3004（同名 key 但 handler 不一致）。统一走这个 composable 后，
 * handler 是同一个引用，key 与选项完全一致，既消除告警也只发一次请求。
 */
export function useSiteSettings() {
  return useAsyncData<PublicSettings>('site-settings', () => fetchSettings())
}
