// PUT /api/admin/settings
//
// 站点配置统一写入口：body { kind, items }，items 为该 kind 对应的数组。
// 约定：
//   - 先校验管理员登录态与 settings:write 权限（异常转 401/403 JSON，同 media.post.ts）；
//   - kind 非法 / items 不是非空对象数组 → 400 中文提示；
//   - 所有写入在同一个事务内完成，不会出现「存了一半」；
//   - 事务提交后写一条审计日志（action=settings_update，entityType=settings）。
//   - site_settings 的就地更新策略见 utils/admin/settings-queries.ts 顶部说明。
import type { H3Event } from 'h3'
import type { SqlConnection } from '../../utils/db/pool'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { writeAuditLog } from '../../utils/auth/audit'
import { withTargetTransaction } from '../../utils/db/query'
import { placeholdersFor, toSafeNumericIds } from '../../utils/public/query'
import {
  KIND_INVALID_MESSAGE,
  SETTINGS_GROUP_BY_KIND,
  buildConfigUpsertStatements,
  buildSettingUpsertStatements,
  normalizeSettingsKind,
  normalizeSettingsPayload,
  toAuditSnapshot,
  type ContactItemInput,
  type FooterItemInput,
  type QrItemInput,
  type ServiceSectionInput,
  type SettingItemInput,
  type SettingsGroupKind,
  type SettingRowInput,
  type SqlStatement,
} from '../../utils/admin/settings-queries'

type ApiError = { error: { code: string; message: string } }

/** 事务内一次保存的产物：待执行语句 + 审计快照。 */
interface SaveOutcome {
  statements: SqlStatement[]
  before: unknown
  after: unknown
}

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): ApiError {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少站点配置写入权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function fail(event: H3Event, status: number, code: string, message: string): ApiError {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function int(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** 按 key 读取 site_settings 的全部版本行（不只看当前行）。 */
const SETTING_STATE_SQL = `SELECT setting_key, setting_value, value_type, media_id, status, version, is_current
  FROM site_settings WHERE setting_key IN (%KEYS%)`

const FOOTER_SERVICE_STATE_SQL = `SELECT id, item_key, title, link_path, sort_order, status
  FROM footer_services WHERE item_key IN (%KEYS%)`

const FOOTER_LINK_STATE_SQL = `SELECT id, item_key, title, link_path, sort_order, status
  FROM footer_links WHERE item_key IN (%KEYS%)`

const CONTACT_STATE_SQL = `SELECT id, item_key, channel_type, label, value, sort_order, status
  FROM contact_channels WHERE item_key IN (%KEYS%)`

const QR_STATE_SQL = `SELECT id, item_key, title, media_id, caption, sort_order, status
  FROM qr_assets WHERE item_key IN (%KEYS%)`

const SERVICE_SECTION_STATE_SQL = `SELECT id, slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status
  FROM service_sections WHERE %CLAUSE%`

const SERVICE_ITEM_STATE_SQL = `SELECT id, section_id, slug, title, summary, icon_key, link_path, sort_order, status
  FROM service_items WHERE %CLAUSE%`

/**
 * 按 key 列表读取当前行。
 * IN 子句只由常量列名与 ? 组成，值全部进参数数组；空列表直接返回空结果（不拼空 IN ()）。
 */
async function selectByKeys(
  connection: SqlConnection,
  sqlTemplate: string,
  values: readonly string[],
): Promise<Record<string, unknown>[]> {
  if (values.length === 0) return []
  const sql = sqlTemplate.replace('%KEYS%', placeholdersFor(values))
  const [rows] = await connection.execute(sql, [...values])
  return rows as Record<string, unknown>[]
}

/** 用 id / slug / section_id 多组条件拼 OR 子句；空组直接跳过，全空时退化为 1 = 0。 */
function orClause(parts: { column: string; values: readonly unknown[]; numeric?: boolean }[]): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  for (const part of parts) {
    const values = part.numeric
      ? toSafeNumericIds(part.values)
      : part.values.map(str).filter(Boolean)
    if (values.length === 0) continue
    clauses.push(`${part.column} IN (${placeholdersFor(values)})`)
    params.push(...values)
  }
  return { sql: clauses.length > 0 ? clauses.join(' OR ') : '1 = 0', params }
}

async function executeStatements(connection: SqlConnection, statements: SqlStatement[]): Promise<void> {
  for (const statement of statements) {
    await connection.execute(statement.sql, statement.params)
  }
}

/** 提交前的配置值快照，字段名与提交体一致，便于比对。 */
function toSettingAudit(row: SettingRowInput): Record<string, unknown> {
  return {
    key: str(row.setting_key),
    value: str(row.setting_value),
    valueType: str(row.value_type) || 'text',
    mediaId: toSafeNumericIds([row.media_id])[0] ?? null,
    status: str(row.status) || 'published',
  }
}

function toTableAudit(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: int(row.id),
    itemKey: str(row.item_key),
    title: str(row.title),
  }
}

/**
 * 文案类 kind（site / home / about / seo）：
 * 先读该批 key 的全部版本行（同一事务内，视图一致），据此判定每个 key 走就地 UPDATE 还是 INSERT。
 */
async function saveGroupKind(
  connection: SqlConnection,
  kind: SettingsGroupKind,
  items: SettingItemInput[],
  userId: number,
): Promise<SaveOutcome> {
  const rows = await selectByKeys(connection, SETTING_STATE_SQL, [...new Set(items.map(item => item.key))])

  const existingKeys = new Set<string>()
  const versionHints = new Map<string, number>()
  const before: Record<string, unknown>[] = []

  for (const row of rows) {
    const key = str(row.setting_key)
    if (!key) continue
    versionHints.set(key, Math.max(versionHints.get(key) ?? 0, int(row.version)))
    if (int(row.is_current) === 1 && !existingKeys.has(key)) {
      existingKeys.add(key)
      before.push(toSettingAudit(row))
    }
  }

  const statements = buildSettingUpsertStatements(items, {
    group: SETTINGS_GROUP_BY_KIND[kind],
    userId,
    existingKeys,
    versionHints,
  })
  await executeStatements(connection, statements)
  return { statements, before, after: items }
}

/** services：板块与其子项按 id 或 slug upsert，不删除未提交的子项。 */
async function saveServicesKind(
  connection: SqlConnection,
  sections: ServiceSectionInput[],
): Promise<SaveOutcome> {
  const sectionClause = orClause([
    { column: 'id', values: sections.map(section => section.id), numeric: true },
    { column: 'slug', values: sections.map(section => section.slug) },
  ])
  const itemClause = orClause([
    { column: 'id', values: sections.flatMap(section => section.items.map(item => item.id)), numeric: true },
    { column: 'slug', values: sections.flatMap(section => section.items.map(item => item.slug)) },
    { column: 'section_id', values: sections.map(section => section.id), numeric: true },
  ])

  const [sectionRows] = await connection.execute(
    SERVICE_SECTION_STATE_SQL.replace('%CLAUSE%', sectionClause.sql),
    sectionClause.params,
  )
  const [itemRows] = await connection.execute(
    SERVICE_ITEM_STATE_SQL.replace('%CLAUSE%', itemClause.sql),
    itemClause.params,
  )

  const statements = buildConfigUpsertStatements({ kind: 'services', items: sections })
  await executeStatements(connection, statements)
  return { statements, before: { sections: sectionRows, items: itemRows }, after: sections }
}

/** footer：业务范围写 footer_services，导航链接写 footer_links，都按 item_key upsert。 */
async function saveFooterKind(
  connection: SqlConnection,
  items: FooterItemInput[],
): Promise<SaveOutcome> {
  const keys = [...new Set(items.map(item => item.itemKey))]
  const [services, links] = await Promise.all([
    selectByKeys(connection, FOOTER_SERVICE_STATE_SQL, keys),
    selectByKeys(connection, FOOTER_LINK_STATE_SQL, keys),
  ])

  const statements = buildConfigUpsertStatements({ kind: 'footer', items })
  await executeStatements(connection, statements)
  return { statements, before: [...services, ...links].map(toTableAudit), after: items }
}

/** contact：按 item_key upsert 联系渠道。 */
async function saveContactKind(
  connection: SqlConnection,
  items: ContactItemInput[],
): Promise<SaveOutcome> {
  const rows = await selectByKeys(connection, CONTACT_STATE_SQL, [...new Set(items.map(item => item.itemKey))])
  const statements = buildConfigUpsertStatements({ kind: 'contact', items })
  await executeStatements(connection, statements)
  return { statements, before: rows.map(toTableAudit), after: items }
}

/** qr：按 item_key upsert 二维码，media_id 由后台上传后关联。 */
async function saveQrKind(
  connection: SqlConnection,
  items: QrItemInput[],
): Promise<SaveOutcome> {
  const rows = await selectByKeys(connection, QR_STATE_SQL, [...new Set(items.map(item => item.itemKey))])
  const statements = buildConfigUpsertStatements({ kind: 'qr', items })
  await executeStatements(connection, statements)
  return { statements, before: rows.map(toTableAudit), after: items }
}

export default defineEventHandler(async (event) => {
  let admin: { id: number; username: string }
  try {
    admin = await requireAdmin(event, 'settings:write')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  let body: unknown = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  const bodyRecord = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}

  const kind = normalizeSettingsKind(bodyRecord.kind)
  if (!kind) return fail(event, 400, 'INVALID_KIND', KIND_INVALID_MESSAGE)

  const payload = normalizeSettingsPayload(kind, bodyRecord.items)
  if (!payload.ok) return fail(event, 400, 'INVALID_ITEMS', `${payload.message}（kind=${kind}）`)

  // 各分支的形状由 normalizeSettingsPayload 按 kind 保证，这里取宽松类型后在分支处收窄。
  const items = payload.items as unknown[]
  const ipDigest = getIpDigest(event)

  try {
    const outcome = await withTargetTransaction(async (connection) => {
      switch (kind) {
        case 'site':
        case 'home':
        case 'about':
        case 'seo':
          return saveGroupKind(connection, kind, items as SettingItemInput[], admin.id)
        case 'services':
          return saveServicesKind(connection, items as ServiceSectionInput[])
        case 'footer':
          return saveFooterKind(connection, items as FooterItemInput[])
        case 'contact':
          return saveContactKind(connection, items as ContactItemInput[])
        default:
          return saveQrKind(connection, items as QrItemInput[])
      }
    })

    const saved = outcome.statements.length
    try {
      await writeAuditLog({
        userId: admin.id,
        username: admin.username,
        action: 'settings_update',
        entityType: 'settings',
        before: toAuditSnapshot(outcome.before),
        after: toAuditSnapshot(outcome.after),
        ipDigest,
        note: `保存站点配置：kind=${kind}，写入 ${saved} 行`,
      })
    } catch (error) {
      // 审计写入失败不影响已提交的配置变更。
      console.error('[admin-settings] 写入审计日志失败', error)
    }

    return { data: { kind, saved } }
  } catch (error) {
    console.error('[admin-settings] 保存配置失败', error)
    return fail(event, 500, 'SETTINGS_WRITE_FAILED', '保存站点配置失败，请稍后重试')
  }
})
