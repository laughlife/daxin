// 后台站点配置的纯函数层：kind 白名单、行映射、入参归一化与 upsert SQL 构造。
//
// 这些函数不访问数据库、不依赖 Nuxt 运行时，因此可在 node:test 中直接单测
// （见 web/scripts/admin-settings.test.mjs）。
// 所有 SQL 只由常量、固定列名与 ? 占位符组成：请求值一律进入 params 数组，
// 绝不做字符串拼接。
//
// 版本策略（site_settings）：
//   实际 DDL 的唯一键是 uk_site_settings_key_version (setting_key, version)，
//   并没有 setting_key 单独的唯一键。因此 `INSERT ... ON DUPLICATE KEY UPDATE`
//   在 version 变化后不会命中旧行，会插入第二行——正是契约要避免的。
//   本模块改为显式二选一：
//     - 该 key 已有 is_current=1 的当前行 → `UPDATE ... WHERE setting_key = ?
//       AND is_current = 1`，`version = version + 1` 就地加一；
//     - 没有任何当前行 → `INSERT`，version 取该 key 现有最大 version + 1，
//       避免撞上历史行的 (setting_key, version) 唯一键。
//   两者互斥，同一个 key 只会生成一条语句。
/** 一条待执行的参数化语句；调用方按数组顺序在同一事务内执行。 */
export interface SqlStatement {
  sql: string
  params: unknown[]
}

/** 允许的 kind，顺序与契约表格一致；错误提示直接用它拼接。 */
export const SETTINGS_KINDS = Object.freeze([
  'site',
  'home',
  'about',
  'seo',
  'services',
  'footer',
  'contact',
  'qr',
] as const)

export type SettingsKind = (typeof SETTINGS_KINDS)[number]

/** 文案类 kind → site_settings.setting_group。 */
export const SETTINGS_GROUP_BY_KIND = Object.freeze({
  site: 'general',
  home: 'home',
  about: 'about',
  seo: 'seo',
} as const)

export type SettingsGroupKind = keyof typeof SETTINGS_GROUP_BY_KIND

/** 文案类 kind（数据源为 site_settings）。 */
export const SETTINGS_GROUP_KINDS = Object.freeze(['site', 'home', 'about', 'seo'] as const)

/** 契约声明的 value_type 取值；其余一律回落 text。 */
export const SETTING_VALUE_TYPES = Object.freeze(['text', 'json', 'image'] as const)

/** site_settings.status 取值；其余一律回落 published。 */
export const SETTING_STATUSES = Object.freeze(['draft', 'published', 'archived'] as const)

/** 请求里 kind 非法时返回给前端的中文提示。 */
export const KIND_INVALID_MESSAGE = `kind 不合法或缺失，允许值：${SETTINGS_KINDS.join('、')}`

const MAX_KEY_LENGTH = 128
const MAX_SLUG_LENGTH = 64
const MAX_ITEM_KEY_LENGTH = 64
const MAX_TITLE_LENGTH = 128
const MAX_SUBTITLE_LENGTH = 255
const MAX_SUMMARY_LENGTH = 2000
const MAX_ICON_LENGTH = 64
const MAX_PATH_LENGTH = 255
const MAX_CHANNEL_TYPE_LENGTH = 32
const MAX_LABEL_LENGTH = 128
const MAX_VALUE_LENGTH = 512
const MAX_CAPTION_LENGTH = 255
const MAX_SETTING_VALUE_LENGTH = 65535

/** 判断某个 kind 的数据源是否为 site_settings。 */
export function isSettingsGroupKind(kind: SettingsKind): kind is SettingsGroupKind {
  return Object.prototype.hasOwnProperty.call(SETTINGS_GROUP_BY_KIND, kind)
}

/** 解析输入中的单个值：h3 的 query 可能给出数组，取第一个字符串。 */
function pick(value: unknown): unknown {
  if (Array.isArray(value)) return value.find(item => typeof item === 'string') ?? value[0]
  return value
}

/**
 * kind 归一化：去首尾空白并转小写后与白名单比对，命中返回 kind，否则返回空串。
 * 大小写不敏感（'SERVICES'、' Services ' 都归一化为 'services'）：
 * 与 public/query.ts 的 normalizeCaseType 保持一致，宽松归一化不会带来风险——
 * 白名单之外的任何值仍然返回空串，由接口统一回 400。
 */
export function normalizeSettingsKind(value: unknown): SettingsKind | '' {
  const picked = pick(value)
  if (typeof picked !== 'string') return ''
  const text = picked.trim().toLowerCase()
  return (SETTINGS_KINDS as readonly string[]).includes(text) ? text as SettingsKind : ''
}

/** 正整数（含数字字符串）→ number；其余（0、负数、小数、空值、非数字）→ null。 */
export function toPositiveIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

/** 非负整数排序值；非法输入回落 0。 */
function normalizeSortOrder(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isInteger(parsed) || parsed < 0) return 0
  return Math.min(parsed, 65535)
}

/** 布尔标记归一化为 1/0；缺省用 fallback。 */
function normalizeFlag(value: unknown, fallback: 0 | 1 = 1): 0 | 1 {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value === 0 ? 0 : 1
  const text = String(value).trim().toLowerCase()
  if (['0', 'false', 'off', 'no', 'disabled', 'inactive'].includes(text)) return 0
  if (['1', 'true', 'on', 'yes', 'enabled', 'active'].includes(text)) return 1
  return fallback
}

/** 归一化短文本：去首尾空白并截断到列宽。 */
function normalizeText(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, maxLength)
}

/** 读取入参中的 id；缺失/非法按 0 处理（0 表示新增）。 */
function normalizeId(value: unknown): number {
  return toPositiveIntOrNull(value) ?? 0
}

/** 校验入参对象；非对象（含数组）返回 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 归一化 value_type：只接受契约声明的 text/json/image，其余回落 text。 */
function normalizeWriteValueType(value: unknown): string {
  const text = normalizeText(value, 16).toLowerCase()
  return (SETTING_VALUE_TYPES as readonly string[]).includes(text) ? text : 'text'
}

/** 读取 value_type：保留库中真实取值（仅小写化），空值回落 text。 */
function normalizeStoredValueType(value: unknown): string {
  return normalizeText(value, 16).toLowerCase() || 'text'
}

/** 归一化 status：只接受 draft/published/archived，其余回落 published。 */
function normalizeSettingStatus(value: unknown): string {
  const text = normalizeText(value, 16).toLowerCase()
  return (SETTING_STATUSES as readonly string[]).includes(text) ? text : 'published'
}

/**
 * 配置值序列化：字符串原样保存（不做 JSON.parse，避免读写不对称号致二次编码）；
 * 数字/布尔转字符串；对象/数组按 JSON.stringify 保存；不可序列化时保存空串。
 */
export function serializeSettingValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.slice(0, MAX_SETTING_VALUE_LENGTH)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return (JSON.stringify(value) ?? '').slice(0, MAX_SETTING_VALUE_LENGTH)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 读：行映射
// ---------------------------------------------------------------------------

export interface SettingRowInput {
  setting_key?: unknown
  setting_value?: unknown
  value_type?: unknown
  media_id?: unknown
  media_url?: unknown
  status?: unknown
}

export interface SettingItem {
  key: string
  value: string
  valueType: string
  mediaId: number | null
  mediaUrl: string
  status: string
}

/**
 * 映射 site_settings 行 → 契约 item。
 *
 * value 决定：**原样返回库里存的字符串，不做 JSON.parse**，并额外给出 valueType。
 * 理由：写回时 value 按字符串原样保存，读写对称就不会二次编码；
 * 结构化数据交给前端按 valueType 自行解析，解析失败也只影响展示，
 * 不会让整份配置读取失败。图片类配置同时给出 mediaUrl（联表取得），
 * 但 value 仍保留库中原文，便于后台展示与排查。
 */
export function mapSettingRow(row: SettingRowInput): SettingItem {
  return {
    key: normalizeText(row.setting_key, MAX_KEY_LENGTH),
    value: row.setting_value === null || row.setting_value === undefined ? '' : String(row.setting_value),
    valueType: normalizeStoredValueType(row.value_type),
    mediaId: toPositiveIntOrNull(row.media_id),
    mediaUrl: normalizeText(row.media_url, 768),
    status: normalizeSettingStatus(row.status),
  }
}

// ---------------------------------------------------------------------------
// 入参归一化
// ---------------------------------------------------------------------------

export interface SettingItemInput {
  key: string
  value: string
  valueType: string
  mediaId: number | null
  status: string
}

export interface ServiceItemInput {
  id: number
  slug: string
  title: string
  summary: string
  iconKey: string
  linkPath: string
  sortOrder: number
  status: 0 | 1
}

export interface ServiceSectionInput {
  id: number
  slug: string
  title: string
  subtitle: string
  summary: string
  iconKey: string
  linkPath: string
  showDetailLink: 0 | 1
  sortOrder: number
  status: 0 | 1
  items: ServiceItemInput[]
}

export interface FooterItemInput {
  id: number
  itemKey: string
  title: string
  linkPath: string
  sortOrder: number
  status: 0 | 1
  /** 数据源表：footer_services（service）或 footer_links（link）。 */
  kind: 'service' | 'link'
}

export interface ContactItemInput {
  id: number
  itemKey: string
  channelType: string
  label: string
  value: string
  sortOrder: number
  status: 0 | 1
}

export interface QrItemInput {
  id: number
  itemKey: string
  title: string
  mediaId: number | null
  caption: string
  sortOrder: number
  status: 0 | 1
}

export type NormalizeResult<T> = { ok: true; items: T[] } | { ok: false; message: string }

function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

/** 文案类 kind 的 items 归一化：每项必须有非空 key。 */
export function normalizeSettingItems(raw: unknown): NormalizeResult<SettingItemInput> {
  if (!Array.isArray(raw) || raw.length === 0) return invalid('items 必须是非空数组')
  const items: SettingItemInput[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return invalid('items 的每一项都必须是对象')
    const key = normalizeText(record.key, MAX_KEY_LENGTH)
    if (!key) return invalid('每个配置项都必须提供非空 key')
    items.push({
      key,
      value: serializeSettingValue(record.value),
      valueType: normalizeWriteValueType(record.valueType),
      mediaId: toPositiveIntOrNull(record.mediaId),
      status: normalizeSettingStatus(record.status),
    })
  }
  return { ok: true, items }
}

function normalizeServiceItem(record: Record<string, unknown>, fallbackIndex: number): ServiceItemInput | null {
  const slug = normalizeText(record.slug, MAX_SLUG_LENGTH)
  const id = normalizeId(record.id)
  if (!slug && !id) return null
  return {
    id,
    slug: slug || `item-${id || fallbackIndex + 1}`,
    title: normalizeText(record.title, MAX_TITLE_LENGTH),
    summary: normalizeText(record.summary, MAX_SUMMARY_LENGTH),
    iconKey: normalizeText(record.iconKey, MAX_ICON_LENGTH),
    linkPath: normalizeText(record.linkPath, MAX_PATH_LENGTH),
    sortOrder: normalizeSortOrder(record.sortOrder),
    status: normalizeFlag(record.status, 1),
  }
}

/** 业务板块归一化：id 与 slug 至少有一个，子项同样要求。 */
export function normalizeServiceSections(raw: unknown): NormalizeResult<ServiceSectionInput> {
  if (!Array.isArray(raw) || raw.length === 0) return invalid('items 必须是非空数组')
  const sections: ServiceSectionInput[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return invalid('items 的每一项都必须是对象')
    const slug = normalizeText(record.slug, MAX_SLUG_LENGTH)
    const id = normalizeId(record.id)
    if (!slug && !id) return invalid('每个业务板块都必须提供 id 或 slug')

    const rawItems = record.items === undefined || record.items === null ? [] : record.items
    if (!Array.isArray(rawItems)) return invalid('业务板块的 items 必须是数组')
    const children: ServiceItemInput[] = []
    for (const [index, child] of rawItems.entries()) {
      const childRecord = asRecord(child)
      if (!childRecord) return invalid('业务子项必须是对象')
      const normalized = normalizeServiceItem(childRecord, index)
      if (!normalized) return invalid('每个业务子项都必须提供 id 或 slug')
      children.push(normalized)
    }

    sections.push({
      id,
      slug: slug || `section-${id}`,
      title: normalizeText(record.title, MAX_TITLE_LENGTH),
      subtitle: normalizeText(record.subtitle, MAX_SUBTITLE_LENGTH),
      summary: normalizeText(record.summary, MAX_SUMMARY_LENGTH),
      iconKey: normalizeText(record.iconKey, MAX_ICON_LENGTH),
      linkPath: normalizeText(record.linkPath, MAX_PATH_LENGTH),
      showDetailLink: normalizeFlag(record.showDetailLink, 0),
      sortOrder: normalizeSortOrder(record.sortOrder),
      status: normalizeFlag(record.status, 1),
      items: children,
    })
  }
  return { ok: true, items: sections }
}

/** 页脚项归一化：业务范围与导航链接共用一个数组，用 kind 区分数据源表。 */
export function normalizeFooterItems(raw: unknown): NormalizeResult<FooterItemInput> {
  if (!Array.isArray(raw) || raw.length === 0) return invalid('items 必须是非空数组')
  const items: FooterItemInput[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return invalid('items 的每一项都必须是对象')
    const itemKey = normalizeText(record.itemKey, MAX_ITEM_KEY_LENGTH)
    if (!itemKey) return invalid('每个页脚项都必须提供非空 itemKey')
    const kind = normalizeText(record.kind, 16).toLowerCase() === 'link' ? 'link' : 'service'
    items.push({
      id: normalizeId(record.id),
      itemKey,
      title: normalizeText(record.title, MAX_TITLE_LENGTH),
      linkPath: normalizeText(record.linkPath, MAX_PATH_LENGTH),
      sortOrder: normalizeSortOrder(record.sortOrder),
      status: normalizeFlag(record.status, 1),
      kind,
    })
  }
  return { ok: true, items }
}

/** 联系渠道归一化。 */
export function normalizeContactItems(raw: unknown): NormalizeResult<ContactItemInput> {
  if (!Array.isArray(raw) || raw.length === 0) return invalid('items 必须是非空数组')
  const items: ContactItemInput[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return invalid('items 的每一项都必须是对象')
    const itemKey = normalizeText(record.itemKey, MAX_ITEM_KEY_LENGTH)
    if (!itemKey) return invalid('每个联系渠道都必须提供非空 itemKey')
    items.push({
      id: normalizeId(record.id),
      itemKey,
      channelType: normalizeText(record.channelType, MAX_CHANNEL_TYPE_LENGTH) || 'phone',
      label: normalizeText(record.label, MAX_LABEL_LENGTH),
      value: normalizeText(record.value, MAX_VALUE_LENGTH),
      sortOrder: normalizeSortOrder(record.sortOrder),
      status: normalizeFlag(record.status, 1),
    })
  }
  return { ok: true, items }
}

/** 二维码归一化。 */
export function normalizeQrItems(raw: unknown): NormalizeResult<QrItemInput> {
  if (!Array.isArray(raw) || raw.length === 0) return invalid('items 必须是非空数组')
  const items: QrItemInput[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) return invalid('items 的每一项都必须是对象')
    const itemKey = normalizeText(record.itemKey, MAX_ITEM_KEY_LENGTH)
    if (!itemKey) return invalid('每个二维码都必须提供非空 itemKey')
    items.push({
      id: normalizeId(record.id),
      itemKey,
      title: normalizeText(record.title, MAX_TITLE_LENGTH),
      mediaId: toPositiveIntOrNull(record.mediaId),
      caption: normalizeText(record.caption, MAX_CAPTION_LENGTH),
      sortOrder: normalizeSortOrder(record.sortOrder),
      status: normalizeFlag(record.status, 1),
    })
  }
  return { ok: true, items }
}

export type SettingsPayload =
  | { ok: true; kind: SettingsGroupKind; items: SettingItemInput[] }
  | { ok: true; kind: 'services'; items: ServiceSectionInput[] }
  | { ok: true; kind: 'footer'; items: FooterItemInput[] }
  | { ok: true; kind: 'contact'; items: ContactItemInput[] }
  | { ok: true; kind: 'qr'; items: QrItemInput[] }
  | { ok: false; message: string }

/** 按 kind 分派 items 归一化；kind 已由调用方归一化。 */
export function normalizeSettingsPayload(kind: SettingsKind, raw: unknown): SettingsPayload {
  if (isSettingsGroupKind(kind)) {
    const result = normalizeSettingItems(raw)
    return result.ok ? { ok: true, kind, items: result.items } : result
  }
  if (kind === 'services') {
    const result = normalizeServiceSections(raw)
    return result.ok ? { ok: true, kind, items: result.items } : result
  }
  if (kind === 'footer') {
    const result = normalizeFooterItems(raw)
    return result.ok ? { ok: true, kind, items: result.items } : result
  }
  if (kind === 'contact') {
    const result = normalizeContactItems(raw)
    return result.ok ? { ok: true, kind, items: result.items } : result
  }
  const result = normalizeQrItems(raw)
  return result.ok ? { ok: true, kind: 'qr', items: result.items } : result
}

// ---------------------------------------------------------------------------
// 写：SQL 构造
// ---------------------------------------------------------------------------

/** 同一 key 只保留最后一项（后台一次提交里的重复项以最后提交的为准）。 */
function dedupeByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>()
  for (const item of items) {
    const key = keyOf(item)
    if (!key) continue
    seen.set(key, item)
  }
  return [...seen.values()]
}

/**
 * 就地更新当前行：version 加一，不新增行。
 * WHERE 同时限定 is_current = 1；ORDER BY version DESC, id ASC LIMIT 1 保证
 * 即使数据里已经存在同一个 key 的多行 is_current = 1（历史遗留或脚本误写），
 * 也只更新其中最新的一行，不会因为「两行一起 version+1」撞 (setting_key, version) 唯一键而失败。
 */
const UPDATE_SETTING_SQL = `UPDATE site_settings
   SET setting_group = ?, setting_value = ?, value_type = ?, media_id = ?,
       version = version + 1, status = ?, is_current = 1, updated_by = ?, updated_at = NOW()
 WHERE setting_key = ? AND is_current = 1
 ORDER BY version DESC, id ASC
 LIMIT 1`

/** 该 key 尚无当前行时插入一行；version 由调用方给出（现有最大 version + 1）。 */
const INSERT_SETTING_SQL = `INSERT INTO site_settings
     (setting_key, setting_group, setting_value, value_type, media_id, version, status, is_current, updated_by, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`

export interface SettingUpsertContext {
  /** 写入的 setting_group（由 kind 决定）。 */
  group: string
  /** 更新人 admin_users.id。 */
  userId?: number | null
  /** 已有 is_current = 1 当前行的 setting_key 集合。 */
  existingKeys?: Iterable<string>
  /** 各 key 现有最大 version；INSERT 时取 max + 1，避免撞 (setting_key, version) 唯一键。 */
  versionHints?: ReadonlyMap<string, number>
}

/**
 * 构造 site_settings 的 upsert 语句。
 *
 * 每个 setting_key 恰好生成一条语句：已有当前行 → UPDATE（version + 1，就地更新）；
 * 没有当前行 → INSERT（version = 现有最大 version + 1）。
 * 绝不使用 `INSERT ... ON DUPLICATE KEY UPDATE`：唯一键是 (setting_key, version)，
 * version 一变就会插新行，正是契约禁止的「一个 key 多行」。
 */
export function buildSettingUpsertStatements(
  items: readonly SettingItemInput[],
  context: SettingUpsertContext,
): SqlStatement[] {
  const existing = new Set<string>(context.existingKeys ?? [])
  const userId = context.userId ?? null
  const statements: SqlStatement[] = []

  for (const item of dedupeByKey(items, item => item.key)) {
    if (existing.has(item.key)) {
      statements.push({
        sql: UPDATE_SETTING_SQL,
        params: [context.group, item.value, item.valueType, item.mediaId, item.status, userId, item.key],
      })
      continue
    }
    const version = Math.max(0, Math.trunc(context.versionHints?.get(item.key) ?? 0)) + 1
    statements.push({
      sql: INSERT_SETTING_SQL,
      params: [item.key, context.group, item.value, item.valueType, item.mediaId, version, item.status, userId],
    })
  }

  return statements
}

const UPSERT_SECTION_BY_SLUG_SQL = `INSERT INTO service_sections
     (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     title = VALUES(title), subtitle = VALUES(subtitle), summary = VALUES(summary),
     icon_key = VALUES(icon_key), link_path = VALUES(link_path),
     show_detail_link = VALUES(show_detail_link), sort_order = VALUES(sort_order),
     status = VALUES(status), updated_at = NOW()`

const UPDATE_SECTION_BY_ID_SQL = `UPDATE service_sections
   SET slug = ?, title = ?, subtitle = ?, summary = ?, icon_key = ?, link_path = ?,
       show_detail_link = ?, sort_order = ?, status = ?, updated_at = NOW()
 WHERE id = ?`

const UPSERT_SERVICE_ITEM_SQL = `INSERT INTO service_items
     (section_id, slug, title, summary, icon_key, link_path, sort_order, status, created_at, updated_at)
   VALUES (%SECTION_ID%, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     section_id = VALUES(section_id), title = VALUES(title), summary = VALUES(summary),
     icon_key = VALUES(icon_key), link_path = VALUES(link_path), sort_order = VALUES(sort_order),
     status = VALUES(status), updated_at = NOW()`

const UPDATE_SERVICE_ITEM_SQL = `UPDATE service_items
   SET section_id = %SECTION_ID%, slug = ?, title = ?, summary = ?, icon_key = ?, link_path = ?,
       sort_order = ?, status = ?, updated_at = NOW()
 WHERE id = ?`

const UPSERT_FOOTER_SERVICE_SQL = `INSERT INTO footer_services (item_key, title, link_path, sort_order, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE title = VALUES(title), link_path = VALUES(link_path),
     sort_order = VALUES(sort_order), status = VALUES(status), updated_at = NOW()`

const UPSERT_FOOTER_LINK_SQL = `INSERT INTO footer_links (item_key, title, link_path, sort_order, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE title = VALUES(title), link_path = VALUES(link_path),
     sort_order = VALUES(sort_order), status = VALUES(status), updated_at = NOW()`

const UPSERT_CONTACT_SQL = `INSERT INTO contact_channels (item_key, channel_type, label, value, sort_order, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE channel_type = VALUES(channel_type), label = VALUES(label),
     value = VALUES(value), sort_order = VALUES(sort_order), status = VALUES(status), updated_at = NOW()`

const UPSERT_QR_SQL = `INSERT INTO qr_assets (item_key, title, media_id, caption, sort_order, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE title = VALUES(title), media_id = VALUES(media_id),
     caption = VALUES(caption), sort_order = VALUES(sort_order), status = VALUES(status), updated_at = NOW()`

export type ConfigUpsertInput =
  | { kind: 'services'; items: readonly ServiceSectionInput[]; userId?: number | null }
  | { kind: 'footer'; items: readonly FooterItemInput[]; userId?: number | null }
  | { kind: 'contact'; items: readonly ContactItemInput[]; userId?: number | null }
  | { kind: 'qr'; items: readonly QrItemInput[]; userId?: number | null }

/**
 * 业务板块子项的 section_id 引用片段。
 * - 板块带 id → 直接用 ? 绑定 id（最直接，不依赖板块行是否已写完）；
 * - 只有 slug → 用子查询按 slug 解析（INSERT 与 UPDATE 都允许标量子查询），
 *   这样「先写板块、再写子项」的顺序由语句顺序保证，不需要 LAST_INSERT_ID。
 */
function sectionIdReference(section: ServiceSectionInput): { sql: string; params: unknown[] } {
  if (section.id > 0) return { sql: '?', params: [section.id] }
  return { sql: '(SELECT id FROM service_sections WHERE slug = ?)', params: [section.slug] }
}

/**
 * 构造 services / footer / contact / qr 的 upsert 语句（按数组顺序执行）。
 * - services：板块按 id 或 slug upsert，子项按 id 或 slug upsert 并关联 section_id；
 *   不删除未提交的子项，只更新提交的；
 * - footer / contact / qr：按 item_key upsert，唯一键都是 item_key，可直接用
 *   `INSERT ... ON DUPLICATE KEY UPDATE`。
 */
export function buildConfigUpsertStatements(input: ConfigUpsertInput): SqlStatement[] {
  if (input.kind === 'services') {
    const statements: SqlStatement[] = []
    for (const section of input.items) {
      if (section.id > 0) {
        statements.push({
          sql: UPDATE_SECTION_BY_ID_SQL,
          params: [
            section.slug, section.title, section.subtitle, section.summary, section.iconKey,
            section.linkPath, section.showDetailLink, section.sortOrder, section.status, section.id,
          ],
        })
      } else {
        statements.push({
          sql: UPSERT_SECTION_BY_SLUG_SQL,
          params: [
            section.slug, section.title, section.subtitle, section.summary, section.iconKey,
            section.linkPath, section.showDetailLink, section.sortOrder, section.status,
          ],
        })
      }

      const reference = sectionIdReference(section)
      for (const item of section.items) {
        if (item.id > 0) {
          statements.push({
            sql: UPDATE_SERVICE_ITEM_SQL.replace('%SECTION_ID%', reference.sql),
            params: [
              ...reference.params, item.slug, item.title, item.summary, item.iconKey,
              item.linkPath, item.sortOrder, item.status, item.id,
            ],
          })
        } else {
          statements.push({
            sql: UPSERT_SERVICE_ITEM_SQL.replace('%SECTION_ID%', reference.sql),
            params: [
              ...reference.params, item.slug, item.title, item.summary, item.iconKey,
              item.linkPath, item.sortOrder, item.status,
            ],
          })
        }
      }
    }
    return statements
  }

  if (input.kind === 'footer') {
    return input.items.map((item) => ({
      sql: item.kind === 'link' ? UPSERT_FOOTER_LINK_SQL : UPSERT_FOOTER_SERVICE_SQL,
      params: [item.itemKey, item.title, item.linkPath, item.sortOrder, item.status],
    }))
  }

  if (input.kind === 'contact') {
    return input.items.map(item => ({
      sql: UPSERT_CONTACT_SQL,
      params: [item.itemKey, item.channelType, item.label, item.value, item.sortOrder, item.status],
    }))
  }

  return input.items.map(item => ({
    sql: UPSERT_QR_SQL,
    params: [item.itemKey, item.title, item.mediaId, item.caption, item.sortOrder, item.status],
  }))
}

// ---------------------------------------------------------------------------
// 审计快照
// ---------------------------------------------------------------------------

/** 疑似凭据字段名，一律不进审计快照。 */
const SECRET_KEY_PATTERN = /(password|passwd|secret|token|credential|api[-_]?key|authorization|cookie|session)/i

const AUDIT_MAX_STRING = 240
const AUDIT_MAX_DEPTH = 3

/**
 * 审计快照脱敏：递归裁剪超长字符串、限制层级，并丢弃任何名字像凭据的字段。
 * 配置数据本身不含密码，这里仍然做白名单式防御，避免以后有人把敏感字段塞进 items。
 */
export function toAuditSnapshot(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    return value.length > AUDIT_MAX_STRING ? `${value.slice(0, AUDIT_MAX_STRING)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (depth >= AUDIT_MAX_DEPTH) return `[${value.length} 项]`
    return value.map(entry => toAuditSnapshot(entry, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= AUDIT_MAX_DEPTH) return '[对象]'
    const snapshot: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue
      snapshot[key] = toAuditSnapshot(entry, depth + 1)
    }
    return snapshot
  }
  return null
}
