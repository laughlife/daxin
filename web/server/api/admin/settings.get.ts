// GET /api/admin/settings?kind=<kind>
//
// 站点配置统一读入口：kind 决定数据源与 item 结构（见 docs/superpowers/task7-admin-contract.md）。
// 约定：
//   - 先校验管理员登录态与 settings:read 权限（异常转 401/403 JSON，沿用 media.post.ts 的写法）；
//   - kind 缺失或不在白名单时返回 400，并在中文提示里列出允许值；
//   - 图片类配置联表 media_assets.public_url 得到 mediaUrl，软删除的媒体不再返回地址；
//   - 文案类 kind 只返回 is_current = 1 的当前行，一行一个 key。
import type { H3Event } from 'h3'
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import {
  KIND_INVALID_MESSAGE,
  SETTINGS_GROUP_BY_KIND,
  isSettingsGroupKind,
  mapSettingRow,
  normalizeSettingsKind,
  toPositiveIntOrNull,
  type SettingRowInput,
} from '../../utils/admin/settings-queries'

type ApiError = { error: { code: string; message: string } }

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): ApiError {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少站点配置读取权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function fail(event: H3Event, status: number, code: string, message: string): ApiError {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

/** site_settings 当前行 + 联表图片地址。 */
const SETTINGS_SQL = `SELECT s.setting_key, s.setting_value, s.value_type, s.media_id, s.status,
    NULLIF(m.public_url, '') AS media_url
  FROM site_settings s
  LEFT JOIN media_assets m ON m.id = s.media_id AND m.deleted_at IS NULL
 WHERE s.setting_group = ? AND s.is_current = 1
 ORDER BY s.sort_order, s.setting_key`

const SERVICE_SECTIONS_SQL = `SELECT ss.id, ss.slug, ss.title, ss.subtitle, ss.summary, ss.icon_key, ss.link_path,
    ss.image_media_id, NULLIF(ma.public_url, '') AS image_url,
    ss.show_detail_link, ss.sort_order, ss.status
  FROM service_sections ss
  LEFT JOIN media_assets ma ON ma.id = ss.image_media_id AND ma.deleted_at IS NULL
 ORDER BY ss.sort_order, ss.id`

const SERVICE_ITEMS_SQL = `SELECT id, section_id, slug, title, summary, sort_order, status
  FROM service_items ORDER BY sort_order, id`

const FOOTER_SERVICES_SQL = `SELECT id, item_key, title, link_path, sort_order, status
  FROM footer_services ORDER BY sort_order, id`

const FOOTER_LINKS_SQL = `SELECT id, item_key, title, link_path, sort_order, status
  FROM footer_links ORDER BY sort_order, id`

const CONTACT_CHANNELS_SQL = `SELECT id, item_key, channel_type, label, value, sort_order, status
  FROM contact_channels ORDER BY sort_order, id`

const QR_ASSETS_SQL = `SELECT q.id, q.item_key, q.title, q.media_id, NULLIF(m.public_url, '') AS media_url,
    q.caption, q.sort_order, q.status
  FROM qr_assets q
  LEFT JOIN media_assets m ON m.id = q.media_id AND m.deleted_at IS NULL
 ORDER BY q.sort_order, q.id`

type Row = Record<string, unknown>

interface ServiceItem {
  id: number
  slug: string
  title: string
  summary: string
  sortOrder: number
  status: boolean
}

interface ServiceSection extends ServiceItem {
  subtitle: string
  imageMediaId: number | null
  imageUrl: string
  iconKey: string
  linkPath: string
  showDetailLink: boolean
  items: ServiceItem[]
}

interface FooterItem {
  id: number
  itemKey: string
  title: string
  linkPath: string
  sortOrder: number
  status: boolean
  kind: 'service' | 'link'
}

interface ContactItem {
  id: number
  itemKey: string
  channelType: string
  label: string
  value: string
  sortOrder: number
  status: boolean
}

interface QrItem {
  id: number
  itemKey: string
  title: string
  mediaId: number | null
  mediaUrl: string
  caption: string
  sortOrder: number
  status: boolean
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function int(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** TINYINT(1) → 布尔，便于前端直接绑定开关。 */
function bool(value: unknown): boolean {
  return int(value) !== 0
}

function mapServiceItem(row: Row): ServiceItem {
  return {
    id: int(row.id),
    slug: str(row.slug),
    title: str(row.title),
    summary: str(row.summary),
    sortOrder: int(row.sort_order),
    status: bool(row.status),
  }
}

function mapServiceSection(row: Row, items: ServiceItem[]): ServiceSection {
  return {
    id: int(row.id),
    slug: str(row.slug),
    title: str(row.title),
    subtitle: str(row.subtitle),
    summary: str(row.summary),
    imageMediaId: toPositiveIntOrNull(row.image_media_id),
    imageUrl: str(row.image_url),
    iconKey: str(row.icon_key),
    linkPath: str(row.link_path),
    showDetailLink: bool(row.show_detail_link),
    sortOrder: int(row.sort_order),
    status: bool(row.status),
    items,
  }
}

function mapFooterRow(row: Row, kind: 'service' | 'link'): FooterItem {
  return {
    id: int(row.id),
    itemKey: str(row.item_key),
    title: str(row.title),
    linkPath: str(row.link_path),
    sortOrder: int(row.sort_order),
    status: bool(row.status),
    kind,
  }
}

function mapContactRow(row: Row): ContactItem {
  return {
    id: int(row.id),
    itemKey: str(row.item_key),
    channelType: str(row.channel_type),
    label: str(row.label),
    value: str(row.value),
    sortOrder: int(row.sort_order),
    status: bool(row.status),
  }
}

function mapQrRow(row: Row): QrItem {
  return {
    id: int(row.id),
    itemKey: str(row.item_key),
    title: str(row.title),
    mediaId: toPositiveIntOrNull(row.media_id),
    mediaUrl: str(row.media_url),
    caption: str(row.caption),
    sortOrder: int(row.sort_order),
    status: bool(row.status),
  }
}

async function loadServices(): Promise<ServiceSection[]> {
  const [sections, items] = await Promise.all([
    queryTarget<Row>(SERVICE_SECTIONS_SQL),
    queryTarget<Row>(SERVICE_ITEMS_SQL),
  ])
  const grouped = new Map<number, ServiceItem[]>()
  for (const row of items) {
    const sectionId = int(row.section_id)
    const list = grouped.get(sectionId)
    if (list) list.push(mapServiceItem(row))
    else grouped.set(sectionId, [mapServiceItem(row)])
  }
  // 子项按 section_id 归组；找不到所属板块的孤儿子项不返回（板块已被删时也不会误挂）。
  return sections.map(row => mapServiceSection(row, grouped.get(int(row.id)) ?? []))
}

async function loadFooter(): Promise<FooterItem[]> {
  const [services, links] = await Promise.all([
    queryTarget<Row>(FOOTER_SERVICES_SQL),
    queryTarget<Row>(FOOTER_LINKS_SQL),
  ])
  // 先业务范围后导航链接，各自按 sort_order 排序，页面上分组展示。
  return [
    ...services.map(row => mapFooterRow(row, 'service')),
    ...links.map(row => mapFooterRow(row, 'link')),
  ]
}

async function loadItems(kind: string): Promise<unknown[]> {
  if (kind === 'services') return loadServices()
  if (kind === 'footer') return loadFooter()
  if (kind === 'contact') return (await queryTarget<Row>(CONTACT_CHANNELS_SQL)).map(mapContactRow)
  return (await queryTarget<Row>(QR_ASSETS_SQL)).map(mapQrRow)
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'settings:read')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const kind = normalizeSettingsKind(getQuery(event).kind)
  if (!kind) return fail(event, 400, 'INVALID_KIND', KIND_INVALID_MESSAGE)

  try {
    if (isSettingsGroupKind(kind)) {
      const rows = await queryTarget<SettingRowInput>(SETTINGS_SQL, [SETTINGS_GROUP_BY_KIND[kind]])
      return { data: { kind, items: rows.map(mapSettingRow) } }
    }
    return { data: { kind, items: await loadItems(kind) } }
  } catch (error) {
    console.error('[admin-settings] 读取配置失败', error)
    return fail(event, 500, 'SETTINGS_READ_FAILED', '站点配置读取失败，请稍后重试')
  }
})
