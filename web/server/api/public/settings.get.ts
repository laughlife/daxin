// GET /api/public/settings
//
// 站点配置：读取当前生效（is_current=1 且 status='published'）的 site_settings，
// value_type='json' 时解码 JSON，关联 media_id 时用 media_assets.public_url 覆盖取值。
// 同时返回后台可维护的页脚数据（业务范围、导航链接、联系渠道、二维码），
// 使页脚不再是前端写死的标签，而是可点击、可在后台编辑的内容。
import { queryTarget } from '../../utils/db/query'

/** 站点名称默认值（数据库无配置时的兜底）。 */
const DEFAULT_SITE_NAME = '大信法务'

/** siteName 的候选配置键。 */
const SITE_NAME_KEYS = new Set(['site_name', 'siteName', 'site_title', 'site.title'])

const SETTINGS_SQL = `SELECT s.setting_key, s.setting_group, s.setting_value, s.value_type, s.media_id,
  NULLIF(m.public_url, '') AS media_url
FROM site_settings s
LEFT JOIN media_assets m ON m.id = s.media_id AND m.deleted_at IS NULL
WHERE s.is_current = 1 AND s.status = 'published'
ORDER BY s.setting_group, s.setting_key`

/** 页脚业务范围（可点击）。 */
const FOOTER_SERVICES_SQL = `SELECT item_key, title, link_path
FROM footer_services WHERE status = 1 ORDER BY sort_order ASC, id ASC`

/** 页脚导航链接。 */
const FOOTER_LINKS_SQL = `SELECT item_key, title, link_path
FROM footer_links WHERE status = 1 ORDER BY sort_order ASC, id ASC`

/** 联系渠道（电话 / 邮箱 / 地址 / 微信号）。 */
const CONTACT_CHANNELS_SQL = `SELECT item_key, channel_type, label, value
FROM contact_channels WHERE status = 1 ORDER BY sort_order ASC, id ASC`

/** 二维码资源；关联 media_assets.public_url 作为图片地址。 */
const QR_ASSETS_SQL = `SELECT q.item_key, q.title, q.caption, NULLIF(m.public_url, '') AS media_url
FROM qr_assets q
LEFT JOIN media_assets m ON m.id = q.media_id AND m.deleted_at IS NULL
WHERE q.status = 1 ORDER BY q.sort_order ASC, q.id ASC`

interface SettingRow {
  setting_key: string | null
  setting_group: string | null
  setting_value: string | null
  value_type: string | null
  media_id: number | string | null
  media_url: string | null
}

/**
 * 解码单条配置值：
 * - 关联了 media_assets 的配置直接取 public_url（图片类配置）；
 * - value_type='json' 时按 JSON 解析，解析失败时返回原文，避免一条脏数据让整站配置读取失败；
 * - value_type='bool' 归一化为布尔值；其余按文本返回。
 */
function decodeSettingValue(row: SettingRow): unknown {
  if (row.media_url) return row.media_url
  const raw = row.setting_value ?? ''
  const valueType = String(row.value_type ?? 'text').toLowerCase()
  if (valueType === 'json') {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (valueType === 'bool') return raw === '1' || raw.toLowerCase() === 'true'
  return raw
}

/** contact 分组下的配置键：contact_phone / contact.phone / phone 都归一化为 phone。 */
function toContactField(key: string, group: string): string {
  if (key.startsWith('contact_')) return key.slice('contact_'.length)
  if (key.startsWith('contact.')) return key.slice('contact.'.length)
  return group === 'contact' ? key : ''
}

export default defineEventHandler(async (event) => {
  try {
    const rows = await queryTarget<SettingRow>(SETTINGS_SQL)
    const settings: Record<string, unknown> = {}
    const contact: Record<string, string> = {}
    let siteName = DEFAULT_SITE_NAME

    for (const row of rows) {
      const key = String(row.setting_key ?? '').trim()
      if (!key) continue
      const value = decodeSettingValue(row)
      settings[key] = value

      if (SITE_NAME_KEYS.has(key) && typeof value === 'string' && value.trim()) siteName = value.trim()

      const field = toContactField(key, String(row.setting_group ?? ''))
      if (field) contact[field] = typeof value === 'string' ? value : String(value ?? '')
    }

    const footer = {
      services: (await queryTarget<Record<string, unknown>>(FOOTER_SERVICES_SQL)).map((row) => ({
        itemKey: String(row.item_key ?? ''),
        title: String(row.title ?? ''),
        linkPath: String(row.link_path ?? ''),
      })),
      links: (await queryTarget<Record<string, unknown>>(FOOTER_LINKS_SQL)).map((row) => ({
        itemKey: String(row.item_key ?? ''),
        title: String(row.title ?? ''),
        linkPath: String(row.link_path ?? ''),
      })),
      channels: (await queryTarget<Record<string, unknown>>(CONTACT_CHANNELS_SQL)).map((row) => ({
        itemKey: String(row.item_key ?? ''),
        channelType: String(row.channel_type ?? ''),
        label: String(row.label ?? ''),
        value: String(row.value ?? ''),
      })),
      qr: (await queryTarget<Record<string, unknown>>(QR_ASSETS_SQL)).map((row) => ({
        itemKey: String(row.item_key ?? ''),
        title: String(row.title ?? ''),
        caption: String(row.caption ?? ''),
        imageUrl: row.media_url ? String(row.media_url) : '',
      })),
    }

    return { data: { siteName, contact, settings, footer } }
  } catch (error) {
    console.error('[public-settings] 站点配置查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'SETTINGS_QUERY_FAILED', message: '站点配置加载失败，请稍后重试' } }
  }
})
