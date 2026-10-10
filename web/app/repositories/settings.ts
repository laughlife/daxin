// 站点配置仓储：站点名称、联系方式，以及后台可维护的页脚数据。
//
// 服务端在 site_settings 为空时会返回中文默认值（siteName='大信法务'），
// 因此这里不做 Mock 兜底；请求失败一律抛出中文 Error。
import { requestPublicApi, unwrapPublicApiData } from '../utils/publicApi'

/** 页脚可点击条目（业务范围与导航链接共用结构）。 */
export interface FooterLinkItem {
  itemKey: string
  title: string
  linkPath: string
}

/** 页脚联系渠道。 */
export interface FooterChannelItem {
  itemKey: string
  channelType: string
  label: string
  value: string
}

/** 页脚二维码。 */
export interface FooterQrItem {
  itemKey: string
  title: string
  caption: string
  imageUrl: string
}

export interface PublicFooter {
  services: FooterLinkItem[]
  links: FooterLinkItem[]
  channels: FooterChannelItem[]
  qr: FooterQrItem[]
}

export interface PublicSettings {
  siteName: string
  contact: Record<string, string>
  /** 其余按 setting_key 原样返回的配置项（JSON 已解码）。 */
  settings: Record<string, unknown>
  /** 页脚数据；服务端未返回时为空集合，页面据此显示空状态而不是报错。 */
  footer: PublicFooter
}

interface SettingsPayload {
  siteName?: string
  contact?: Record<string, string>
  settings?: Record<string, unknown>
  footer?: Partial<PublicFooter>
}

const SETTINGS_ENDPOINT = '/api/public/settings'
const SETTINGS_FAILURE_MESSAGE = '站点配置加载失败，请稍后重试'
const DEFAULT_SITE_NAME = '大信法务'

/** 把服务端返回的页脚分组归一化为数组，缺字段时补空值，避免前端解构炸掉。 */
function normalizeFooterLinks(value: unknown): FooterLinkItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      itemKey: String(record.itemKey ?? ''),
      title: String(record.title ?? ''),
      linkPath: String(record.linkPath ?? ''),
    }
  })
}

function normalizeFooterChannels(value: FooterChannelItem[] | undefined): FooterChannelItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    itemKey: String(item?.itemKey ?? ''),
    channelType: String(item?.channelType ?? ''),
    label: String(item?.label ?? ''),
    value: String(item?.value ?? ''),
  }))
}

function normalizeFooterQr(value: FooterQrItem[] | undefined): FooterQrItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    itemKey: String(item?.itemKey ?? ''),
    title: String(item?.title ?? ''),
    caption: String(item?.caption ?? ''),
    imageUrl: String(item?.imageUrl ?? ''),
  }))
}

export async function fetchSettings(): Promise<PublicSettings> {
  const payload = await requestPublicApi<SettingsPayload>(SETTINGS_ENDPOINT)
  const data = unwrapPublicApiData(payload, SETTINGS_FAILURE_MESSAGE)
  const footer = data.footer ?? {}
  return {
    siteName: typeof data.siteName === 'string' && data.siteName ? data.siteName : DEFAULT_SITE_NAME,
    contact: data.contact && typeof data.contact === 'object' ? data.contact : {},
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    footer: {
      services: normalizeFooterLinks(footer.services),
      links: normalizeFooterLinks(footer.links),
      channels: normalizeFooterChannels(footer.channels),
      qr: normalizeFooterQr(footer.qr),
    },
  }
}
