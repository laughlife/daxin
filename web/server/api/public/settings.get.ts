// GET /api/public/settings
//
// 站点配置：读取当前生效（is_current=1 且 status='published'）的 site_settings，
// value_type='json' 时解码 JSON，关联 media_id 时用 media_assets.public_url 覆盖取值。
// site_settings 目前为空表，此时必须返回中文默认值而不是报错。
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

    return { data: { siteName, contact, settings } }
  } catch (error) {
    console.error('[public-settings] 站点配置查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'SETTINGS_QUERY_FAILED', message: '站点配置加载失败，请稍后重试' } }
  }
})
