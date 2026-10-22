/**
 * 后台站点配置的前端类型定义（对应 /api/admin/settings 的各 kind）。
 *
 * 这些类型只描述接口返回与提交的数据形状；服务端的权威归一化在
 * `web/server/utils/admin/settings-queries.ts`。注意 `site|home|about|seo`
 * 的 `value` 是**库中原始字符串**：`valueType: 'json'` 的项需要页面自行
 * `JSON.parse` / `JSON.stringify`，接口不做转换（读写对称，避免二次编码）。
 */

/** 文案类 kind（数据源为 site_settings） */
export type SettingGroupKind = 'site' | 'home' | 'about' | 'seo'

/** 全部 kind */
export type SettingsKind = SettingGroupKind | 'services' | 'footer' | 'contact' | 'qr'

/** value_type 取值 */
export type SettingValueType = 'text' | 'json' | 'image'

/** site|home|about|seo 的单项 */
export interface SettingItem {
  key: string
  /** 库中原始字符串（json 需自行解析） */
  value: string
  valueType: string
  mediaId: number | null
  mediaUrl: string
  status: string
}

/** services 的子项 */
export interface ServiceChildItem {
  id: number
  slug: string
  title: string
  summary: string
  sortOrder: number
  status: number
}

/** services 的业务板块 */
export interface ServiceSection {
  id: number
  slug: string
  title: string
  subtitle: string
  summary: string
  imageMediaId: number | null
  imageUrl: string
  iconKey: string
  linkPath: string
  showDetailLink: number
  sortOrder: number
  status: number
  items: ServiceChildItem[]
}

/** footer：业务项与导航链接共用一个数组，用 kind 区分数据源表 */
export interface FooterItem {
  id: number
  itemKey: string
  title: string
  linkPath: string
  sortOrder: number
  status: number
  kind: 'service' | 'link'
}

/** contact：联系渠道 */
export interface ContactItem {
  id: number
  itemKey: string
  channelType: string
  label: string
  value: string
  sortOrder: number
  status: number
}

/** qr：二维码 */
export interface QrItem {
  id: number
  itemKey: string
  title: string
  mediaId: number | null
  mediaUrl: string
  caption: string
  sortOrder: number
  status: number
}

/** home_stats 数组的一项（结构化编辑器用） */
export interface HomeStatEntry {
  value: string
  description: string
  emphasis: boolean
}
