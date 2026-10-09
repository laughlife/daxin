// 站点配置仓储：站点名称与联系方式。
//
// 服务端在 site_settings 为空时会返回中文默认值（siteName='大信法务'），
// 因此这里不做 Mock 兜底；请求失败一律抛出中文 Error。
import { requestPublicApi, unwrapPublicApiData } from '../utils/publicApi'

export interface PublicSettings {
  siteName: string
  contact: Record<string, string>
  /** 其余按 setting_key 原样返回的配置项（JSON 已解码）。 */
  settings: Record<string, unknown>
}

interface SettingsPayload {
  siteName?: string
  contact?: Record<string, string>
  settings?: Record<string, unknown>
}

const SETTINGS_ENDPOINT = '/api/public/settings'
const SETTINGS_FAILURE_MESSAGE = '站点配置加载失败，请稍后重试'
const DEFAULT_SITE_NAME = '大信法务'

export async function fetchSettings(): Promise<PublicSettings> {
  const payload = await requestPublicApi<SettingsPayload>(SETTINGS_ENDPOINT)
  const data = unwrapPublicApiData(payload, SETTINGS_FAILURE_MESSAGE)
  return {
    siteName: typeof data.siteName === 'string' && data.siteName ? data.siteName : DEFAULT_SITE_NAME,
    contact: data.contact && typeof data.contact === 'object' ? data.contact : {},
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  }
}
