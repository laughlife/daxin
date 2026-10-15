// 后台内容管理（文章 / 案例 / 品牌 / 律所）的纯函数层。
//
// 与其他 utils 一致：本文件不访问数据库、不依赖 Nuxt 运行时，因此可以被 node:test 直接导入
// （见 web/scripts/admin-content.test.mjs）。这里集中放三类东西：
//   1. 写入白名单与请求值解析（状态、日期、案件号、slug）——所有校验规则只此一份；
//   2. 列表 / 详情 / 统计的 SQL 片段——只由常量与 ? 占位符组成，用户输入一律进参数数组；
//   3. 数据库行 → 后台响应结构的映射——内部迁移字段（legacy_source_*、migration_batch_id、
//      verified_at 等）绝不进入输出，NULL 一律收敛成 '' 或 null，不泄漏 undefined。
//
// 相对导入显式带 .ts 后缀：node 的类型剥离不做扩展名补全，
// 而 Nuxt 生成的 tsconfig 已开启 allowImportingTsExtensions。
import { escapeLikePattern } from '../public/article-query.ts'
import { normalizeDateOnly, normalizeText } from '../public/query.ts'

/** 关键词长度上限，避免超长输入拖垮 LIKE 查询。 */
export const MAX_KEYWORD_LENGTH = 60
/** slug 列宽 191，留出后缀空间后截断到 180（与旧站迁移脚本口径一致）。 */
export const MAX_SLUG_LENGTH = 180
const MAX_SLUG_ATTEMPTS = 200

/** 中文（CJK 基本区）：用于判断标题该走可读分支还是哈希分支。 */
const CJK_PATTERN = /[\u4e00-\u9fa5]/

/** 建表时的列名形态；任何拼进 SQL 的标识符都必须先过这一关。 */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/

/** 一条待执行语句；params 全部走 ? 占位符。 */
export interface ContentSqlStatement {
  sql: string
  params: unknown[]
}

/** 以 " AND ..." 开头（可能是空串）的过滤片段与参数。 */
export interface AdminFilterSql {
  sql: string
  params: unknown[]
}

// ---------------------------------------------------------------------------
// 分页
// ---------------------------------------------------------------------------

/**
 * 后台内容列表默认每页条数。
 *
 * 后台页面默认 20 条，最多 50 条；页码与边界处理复用公开分页工具，后台上限单独传入。
 */
export const ADMIN_DEFAULT_PAGE_SIZE = 20
export const ADMIN_MAX_PAGE_SIZE = 50

/** 未提供 pageSize 时补后台默认值；其余取值原样交给 resolvePageWindow 夹取。 */
export function adminPageSize(value: unknown): unknown {
  if (value === undefined || value === null) return ADMIN_DEFAULT_PAGE_SIZE
  if (typeof value === 'string' && value.trim() === '') return ADMIN_DEFAULT_PAGE_SIZE
  return value
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

/** articles.status 与 cases.publish_status 的合法取值。 */
export const CONTENT_STATUSES: readonly string[] = Object.freeze(['draft', 'published', 'archived'])

/** cases.status（内部流转状态，不进入前台列表）。 */
export const CASE_INTERNAL_STATUSES: readonly string[] = Object.freeze(['open', 'closed', 'archived'])

export type ContentStatus = 'draft' | 'published' | 'archived'
export type CaseInternalStatus = 'open' | 'closed' | 'archived'

export type PublishStatus = ContentStatus

/** 读取状态：只接受白名单取值（大小写不敏感），其余返回空串。 */
export function readContentStatus(value: unknown): ContentStatus | '' {
  const text = normalizeText(value).toLowerCase()
  return CONTENT_STATUSES.includes(text) ? text as ContentStatus : ''
}

/**
 * 解析写入请求里的文章状态。
 * - 缺省（undefined / null / 空串）→ defaultStatus，默认 'draft'（新建文章不发布）；
 * - 合法取值 → 归一化结果（大小写不敏感）；
 * - 其余（未知字符串、数字等）→ null，调用方必须回 400，绝不静默改写。
 */
export function parseContentStatus(value: unknown, defaultStatus: ContentStatus = 'draft'): ContentStatus | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return defaultStatus
  return readContentStatus(value) || null
}

/** 同 parseContentStatus；默认值 'draft'。 */
export function normalizeContentStatus(value: unknown, defaultStatus: ContentStatus = 'draft'): ContentStatus {
  return parseContentStatus(value, defaultStatus) ?? defaultStatus
}

/** 读取 publish_status；与文章共用同一套取值，非法值返回空串。 */
export function readPublishStatus(value: unknown): PublishStatus | '' {
  return readContentStatus(value)
}

/** 解析案例 publish_status；默认 'draft'（与 cases.publish_status 建表默认值一致）。 */
export function parsePublishStatus(value: unknown, defaultStatus: PublishStatus = 'draft'): PublishStatus | null {
  return parseContentStatus(value, defaultStatus)
}

/** 同 parsePublishStatus；默认值 'draft'。 */
export function normalizePublishStatus(value: unknown, defaultStatus: PublishStatus = 'draft'): PublishStatus {
  return parsePublishStatus(value, defaultStatus) ?? defaultStatus
}

/** 读取 cases.status（内部状态）；非法值返回空串。 */
export function readCaseStatus(value: unknown): CaseInternalStatus | '' {
  const text = normalizeText(value).toLowerCase()
  return CASE_INTERNAL_STATUSES.includes(text) ? text as CaseInternalStatus : ''
}

/** 解析 cases.status；默认 'open'（建表默认值）。非法值返回 null。 */
export function parseCaseStatus(value: unknown, defaultStatus: CaseInternalStatus = 'open'): CaseInternalStatus | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return defaultStatus
  return readCaseStatus(value) || null
}

/** 品牌 / 律所的 status 是 TINYINT(1)：0 = 归档，1 = 正常。 */
export function readEntityStatus(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1
  if (value === false || value === 0) return 0
  const text = normalizeText(value).toLowerCase()
  if (text === '1' || text === 'true' || text === 'active' || text === 'published') return 1
  if (text === '0' || text === 'false' || text === 'archived' || text === 'deleted') return 0
  return null
}

/** 解析品牌 / 律所 status；缺省回落 fallback（默认 1 = 正常），非法值返回 null。 */
export function parseEntityStatus(value: unknown, fallback: 0 | 1 = 1): 0 | 1 | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return fallback
  return readEntityStatus(value)
}

/** 列表筛选用的 status 参数；非法值返回 null 表示「不筛选」。 */
export function filterEntityStatus(value: unknown): 0 | 1 | null {
  return readEntityStatus(value)
}

// ---------------------------------------------------------------------------
// 日期
// ---------------------------------------------------------------------------

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

export type CellParseResult =
  | { ok: true; value: string | null }
  | { ok: false }

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * 解析 DATETIME 入参（articles.published_at）。
 * - null / undefined / 空串 → { ok: true, value: null }（显式清空）；
 * - YYYY-MM-DD → 补全为当日 00:00:00；
 * - YYYY-MM-DD HH:mm[:ss]（也接受 T 分隔）→ 归一化输出；
 * - 不存在的日期（2024-02-31）或无法识别的文本 → { ok: false }，调用方回 400。
 */
export function parseDateTimeInput(value: unknown): CellParseResult {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const text = value.trim()
  if (!text) return { ok: true, value: null }

  if (DATE_ONLY_PATTERN.test(text)) {
    const [year, month, day] = text.split('-').map(Number) as [number, number, number]
    return isRealDate(year, month, day) ? { ok: true, value: `${text} 00:00:00` } : { ok: false }
  }

  const match = DATE_TIME_PATTERN.exec(text)
  if (!match) return { ok: false }
  const [, year, month, day, hour, minute, second = '00'] = match
  if (!isRealDate(Number(year), Number(month), Number(day))) return { ok: false }
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return { ok: false }
  return { ok: true, value: `${year}-${month}-${day} ${hour}:${minute}:${second}` }
}

/**
 * 解析 DATE 入参（cases.filed_at）。
 * 只接受 YYYY-MM-DD（可带时间部分，时间被丢弃）；null / 空串表示清空。
 */
export function parseDateInput(value: unknown): CellParseResult {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const text = value.trim()
  if (!text) return { ok: true, value: null }
  if (!DATE_ONLY_PATTERN.test(text.slice(0, 10))) return { ok: false }
  if (text.length > 10 && !DATE_TIME_PATTERN.test(text)) return { ok: false }
  const dateOnly = normalizeDateOnly(text.slice(0, 10))
  return dateOnly ? { ok: true, value: dateOnly } : { ok: false }
}

// ---------------------------------------------------------------------------
// 案件号
// ---------------------------------------------------------------------------

/** 案件号形态：24-cv-0006；输入大小写不敏感，入库统一小写。 */
export const CASE_NUMBER_PATTERN = /^(\d{2})-([a-z]{2})-(\d+)$/i

/** 归一化案件号：非法形态返回空串（调用方据此回 400）。 */
export function normalizeCaseNumber(value: unknown): string {
  const text = normalizeText(value).toLowerCase()
  return CASE_NUMBER_PATTERN.test(text) ? text : ''
}

export function isValidCaseNumber(value: unknown): boolean {
  return normalizeCaseNumber(value) !== ''
}

/** 案件号派生出的 cases 列（与 003_backfill 的口径一致：yy 段补 2000）。 */
export interface CaseNumberParts {
  caseYear: number
  caseSeq: number
  caseType: string
}

/** 拆解案件号；非法输入返回 null。 */
export function parseCaseNumberParts(value: unknown): CaseNumberParts | null {
  const text = normalizeCaseNumber(value)
  if (!text) return null
  const match = CASE_NUMBER_PATTERN.exec(text)
  if (!match) return null
  const [, year, type, seq] = match
  const caseSeq = Number.parseInt(seq ?? '', 10)
  if (!Number.isFinite(caseSeq)) return null
  return {
    caseYear: 2000 + Number.parseInt(year ?? '0', 10),
    caseSeq,
    caseType: type ?? '',
  }
}

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

/** FNV-1a 32 位短哈希；与 tools/migrate-legacy/legacy-parser.mjs 的 shortHash 算法一致。 */
export function shortHash(text: unknown): string {
  const value = String(text ?? '')
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 标题 → slug。变换与 tools/migrate-legacy/legacy-parser.mjs 的 slugify 完全一致（不 import tools/**）：
 * 纯 ASCII 标题保持可读；含中文时把每段中文替换成短哈希，再追加整串哈希保证稳定；
 * 完全无法识别的输入回落到 legacy-<hash>，因此永远返回非空、可重复计算的 slug。
 *
 * 与旧脚本的一处差异：分支判断改用「标题里是否出现中文」，而不是「去掉非 ASCII 后是否还有剩余」。
 * 旧写法会让「TRO 预警：……」「TRO 成功案例：……」这类中英混排标题全部塌缩成同一个 'tro'，
 * 既不符合脚本注释里「中文标题转成稳定前缀加十六进制」的意图，也会让后台新建的每篇文章都撞车。
 * 同一套变换下，中文标题现在得到带哈希的稳定前缀。
 */
export function slugifyTitle(title: unknown): string {
  const text = String(title ?? '').trim()

  if (!CJK_PATTERN.test(text)) {
    const asciiOnly = text
      .toLowerCase()
      .replace(/[‘’“”]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return asciiOnly ? asciiOnly.slice(0, MAX_SLUG_LENGTH) : `legacy-${shortHash(text)}`
  }

  const mixed = text
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!mixed) return `legacy-${shortHash(text)}`

  const encoded = mixed.replace(/[\u4e00-\u9fa5]+/g, chunk => shortHash(chunk))
  return `${encoded}-${shortHash(text)}`.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, MAX_SLUG_LENGTH)
}

function truncateSlug(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, Math.max(1, maxLength))
}

/**
 * 保证 slug 唯一：base 未被占用时原样返回（统一小写），否则依次尝试 `base-2`、`base-3`……
 * 全部占用时追加短哈希兜底，因此函数永远返回一个非空且不在 existingSlugs 中的 slug。
 * existingSlugs 的比较是大小写不敏感的（与 utf8mb4_unicode_ci 唯一键一致）。
 */
export function ensureUniqueSlug(base: unknown, existingSlugs: Iterable<string> = []): string {
  const taken = new Set<string>()
  for (const slug of existingSlugs) taken.add(String(slug ?? '').trim().toLowerCase())

  const seed = normalizeText(base).toLowerCase() || `legacy-${shortHash('')}`
  if (!taken.has(seed)) return seed

  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const suffix = String(attempt)
    const candidate = `${truncateSlug(seed, MAX_SLUG_LENGTH - suffix.length - 1)}-${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }

  const fallbackSuffix = shortHash(`${seed}:${taken.size}`)
  return `${truncateSlug(seed, MAX_SLUG_LENGTH - fallbackSuffix.length - 1)}-${fallbackSuffix}`
}

// ---------------------------------------------------------------------------
// 请求体取值
// ---------------------------------------------------------------------------

/** 请求体是否为普通对象（数组、null 一律视为空对象）。 */
export function toRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

/** 字段是否显式出现在请求体中（区分「未提供」与「显式传 null」）。 */
export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/**
 * 「显式清空」判定：null / undefined / 纯空白字符串。
 * 注意数字 0 不算清空——它会被后续的 id 校验拒绝，而不是被静默当成 null。
 */
export function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  return typeof value === 'string' && value.trim() === ''
}

/** 文本：合并空白并去首尾，null / 非字符串 → ''。 */
export function toText(value: unknown): string {
  return normalizeText(value)
}

/** 布尔开关：接受 true/false、1/0、'1'/'0'/'true'/'false'/'on'。 */
export function toBooleanFlag(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false
  if (typeof value === 'number') return value !== 0
  const text = normalizeText(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'on' || text === 'yes'
}

/** 正整数 id；非整数 / <= 0 / 空值 → null。 */
export function toNullableId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(normalizeText(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** 路径参数里的 id；非法值返回 null，调用方据此回 404。 */
export function toRouteId(value: unknown): number | null {
  const text = normalizeText(value)
  return /^\d{1,20}$/.test(text) ? toNullableId(text) : null
}

function toCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function toId(value: unknown): number {
  const parsed = toCount(value)
  return parsed > 0 ? parsed : 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 数据库时间 → 'YYYY-MM-DD HH:mm:ss'；NULL / 非法值 → ''。 */
export function toDateTimeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} `
      + `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`
  }
  const text = normalizeText(value)
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(text)
  if (!match) return ''
  const datePart = match[1] ?? ''
  const timePart = match[2]
  if (!datePart) return ''
  if (!timePart) return `${datePart} 00:00:00`
  return `${datePart} ${timePart.length === 5 ? `${timePart}:00` : timePart}`
}

/** 数据库 DATE → 'YYYY-MM-DD'；NULL / 非法值 → ''。 */
export function toDateText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
  }
  return normalizeDateOnly(normalizeText(value).slice(0, 10))
}

// ---------------------------------------------------------------------------
// UPDATE 语句：显式白名单
// ---------------------------------------------------------------------------

/**
 * 服务端可信的 SQL 表达式列值（目前只允许 NOW()）。
 * 用对象字面量而不是 class：node 的类型剥离不支持参数属性等需要转换的语法。
 * 表达式字符串只能由本文件的白名单产生，绝不接受请求体传入。
 */
export interface SqlExpression {
  readonly __sql: string
}

const ALLOWED_SQL_EXPRESSIONS: readonly string[] = Object.freeze(['NOW()'])

/** 数据库当前时间表达式，用于「发布即定时」把 published_at 直接写成 NOW()。 */
export function sqlNow(): SqlExpression {
  return { __sql: 'NOW()' }
}

function isSqlExpression(value: unknown): value is SqlExpression {
  return !!value && typeof value === 'object'
    && ALLOWED_SQL_EXPRESSIONS.includes((value as SqlExpression).__sql)
}

/**
 * 由「显式白名单 + 变更字典」构造 UPDATE 语句。
 *
 * 关键约束：进入 SET 子句的列只可能来自 allowedColumns，请求体里多出来的键（含只读的
 * caseCount、内部迁移字段）一律被忽略，因此不存在「用请求键拼 SQL」的路径。
 * 列值默认走 ? 占位符；只有服务端用 sqlNow() 构造的表达式才会以字面量形式出现（白名单校验）。
 * 没有任何可写字段变化时返回 null，调用方跳过 UPDATE 与审计。
 *
 * @param table 目标表；必须是建表时的列名形态（^[a-z][a-z0-9_]*$）。
 * @param changes 以数据库列名为键的变更字典（由调用方映射，不用请求键）。
 */
export function buildUpdateStatement(
  table: string,
  id: number,
  changes: Record<string, unknown>,
  allowedColumns: readonly string[],
): ContentSqlStatement | null {
  if (!IDENTIFIER_PATTERN.test(table)) throw new Error(`非法表名：${table}`)
  const columns = allowedColumns.filter((column) => {
    if (!IDENTIFIER_PATTERN.test(column)) throw new Error(`非法列名：${column}`)
    return hasOwn(changes, column)
  })
  if (columns.length === 0) return null

  const params: unknown[] = []
  const assignments = columns.map((column) => {
    const value = changes[column]
    if (isSqlExpression(value)) return `${column} = ${value.__sql}`
    params.push(value)
    return `${column} = ?`
  })

  return {
    sql: `UPDATE ${table} SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = ?`,
    params: [...params, id],
  }
}

/** 审计快照取值：SQL 表达式按字面量记录（如 'NOW()'），null / undefined 统一记成 null。 */
function toAuditValue(value: unknown): unknown {
  if (isSqlExpression(value)) return value.__sql
  return value ?? null
}

/** 从两个变更字典里挑出取值不同的列，供审计只记录变化字段。 */
export function pickChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}
  for (const key of Object.keys(after)) {
    const nextValue = toAuditValue(after[key])
    const previousValue = toAuditValue(before[key])
    if (String(previousValue ?? '') === String(nextValue ?? '')) continue
    changedBefore[key] = previousValue
    changedAfter[key] = nextValue
  }
  return { before: changedBefore, after: changedAfter }
}

// ---------------------------------------------------------------------------
// 写入列白名单
// ---------------------------------------------------------------------------

/** articles 可写列；view_count、legacy_*、migration_batch_id 等一律不可写。 */
export const ARTICLE_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  'slug', 'title', 'summary', 'content_html', 'category_id', 'published_at', 'status', 'is_featured',
  // 侧边栏管理：标记该文章是否进入首页侧栏「推荐阅读」
  'show_in_sidebar',
])

/** cases 可写列；legacy_*、migration_batch_id、verified_at 一律不可写。 */
export const CASE_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  'case_number', 'case_year', 'case_seq', 'case_type', 'filed_at', 'plaintiff',
  'court', 'title', 'status', 'publish_status',
])

/** brands 可写列；case_count 只读，region 不属于品牌，均不在此列。 */
export const BRAND_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  'slug', 'name', 'name_en', 'aliases', 'summary', 'status',
])

/** law_firms 可写列；case_count 只读。 */
export const LAW_FIRM_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  'slug', 'name', 'name_en', 'aliases', 'region', 'summary', 'status',
])

// ---------------------------------------------------------------------------
// 案例关联：按 id 覆盖式替换
// ---------------------------------------------------------------------------

/**
 * 关联写入入参。三个字段各自独立处理：
 *   - `undefined`：请求里没有这个字段 → 完全不碰对应的关联表（保留既有关系）；
 *   - `null`：显式清空 → 只发 DELETE，删掉该案件在该表里的既有行；
 *   - 正整数 id：覆盖式替换 → DELETE 该案件在该表里的全部行，再 INSERT 一行新的。
 */
export interface CaseRelationInput {
  brandId?: number | null
  lawFirmId?: number | null
  ipTypeId?: number | null
}

interface RelationSpec {
  table: string
  column: string
  insertSql: (caseId: number) => ContentSqlStatement
}

/**
 * 案件关联表定义。
 *
 * 侵权类型只写 case_ip_types：公开接口的 caseType 由 case-mapper.ts 从
 * case_ip_types + ip_types.slug 推导（unknown 落回空串，绝不假装成某个具体类型），
 * 因此后台把类型从 unknown 改成真实类型时，替换本关联即可让前台口径同步，
 * 绝不去 cases 表上存类型。
 */
const CASE_RELATION_SPECS: Readonly<Record<'brand' | 'lawFirm' | 'ipType', RelationSpec>> = Object.freeze({
  brand: {
    table: 'case_brands',
    column: 'brand_id',
    insertSql: (caseId: number) => ({
      sql: 'INSERT INTO case_brands (case_id, brand_id) VALUES (?, ?)',
      params: [caseId],
    }),
  },
  lawFirm: {
    table: 'case_law_firms',
    column: 'law_firm_id',
    insertSql: (caseId: number) => ({
      sql: 'INSERT INTO case_law_firms (case_id, law_firm_id, is_primary) VALUES (?, ?, 1)',
      params: [caseId],
    }),
  },
  ipType: {
    table: 'case_ip_types',
    column: 'ip_type_id',
    insertSql: (caseId: number) => ({
      sql: 'INSERT INTO case_ip_types (case_id, ip_type_id) VALUES (?, ?)',
      params: [caseId],
    }),
  },
})

function relationStatements(
  spec: RelationSpec,
  caseId: number,
  value: number | null,
): ContentSqlStatement[] {
  const statements: ContentSqlStatement[] = [
    { sql: `DELETE FROM ${spec.table} WHERE case_id = ?`, params: [caseId] },
  ]
  if (value !== null) {
    const insert = spec.insertSql(caseId)
    statements.push({ sql: insert.sql, params: [...insert.params, value] })
  }
  return statements
}

/**
 * 构造案件关联的覆盖式替换语句（在同一个事务里执行）。
 *
 * - 只处理请求里给出的关联（`undefined` 跳过，`null` 清空）；
 * - 每个被处理的关联表都是「先删该案件的全部既有行，再插入一行新值」，
 *   因此在同一事务内不会与 uk_case_brands / uk_case_law_firms / uk_case_ip_types 冲突。
 */
export function buildCaseRelationStatements(caseId: number, relations: CaseRelationInput): ContentSqlStatement[] {
  const statements: ContentSqlStatement[] = []
  if (relations.brandId !== undefined) {
    statements.push(...relationStatements(CASE_RELATION_SPECS.brand, caseId, relations.brandId))
  }
  if (relations.lawFirmId !== undefined) {
    statements.push(...relationStatements(CASE_RELATION_SPECS.lawFirm, caseId, relations.lawFirmId))
  }
  if (relations.ipTypeId !== undefined) {
    statements.push(...relationStatements(CASE_RELATION_SPECS.ipType, caseId, relations.ipTypeId))
  }
  return statements
}

/**
 * 解析案例关联入参。区分三种语义（与 buildCaseRelationStatements 一致）：
 *   - 字段未出现 → 结果里也没有该键（不碰关联表）；
 *   - 字段为 null / 空串 → 显式清空（结果里是该键 = null）；
 *   - 正整数 → 覆盖式替换。
 * 非法取值（0、负数、非数字）返回 { ok: false, field }，调用方回 400。
 */
export type CaseRelationParse =
  | { ok: true; relations: CaseRelationInput }
  | { ok: false; field: string }

export function parseCaseRelations(input: Record<string, unknown>): CaseRelationParse {
  const relations: CaseRelationInput = {}

  if (hasOwn(input, 'brandId')) {
    if (isBlankValue(input.brandId)) {
      relations.brandId = null
    } else {
      const brandId = toNullableId(input.brandId)
      if (brandId === null) return { ok: false, field: 'brandId' }
      relations.brandId = brandId
    }
  }

  if (hasOwn(input, 'lawFirmId')) {
    if (isBlankValue(input.lawFirmId)) {
      relations.lawFirmId = null
    } else {
      const lawFirmId = toNullableId(input.lawFirmId)
      if (lawFirmId === null) return { ok: false, field: 'lawFirmId' }
      relations.lawFirmId = lawFirmId
    }
  }

  if (hasOwn(input, 'ipTypeId')) {
    if (isBlankValue(input.ipTypeId)) {
      relations.ipTypeId = null
    } else {
      const ipTypeId = toNullableId(input.ipTypeId)
      if (ipTypeId === null) return { ok: false, field: 'ipTypeId' }
      relations.ipTypeId = ipTypeId
    }
  }

  return { ok: true, relations }
}

/** 关联表定义，供 handlers 校验「关联目标存在」时复用同一份表名 / 列名。 */
export const CASE_RELATION_TARGETS = Object.freeze([
  { field: 'brandId', targetTable: 'brands', label: '品牌' },
  { field: 'lawFirmId', targetTable: 'law_firms', label: '律所' },
  { field: 'ipTypeId', targetTable: 'ip_types', label: '侵权类型' },
])

// ---------------------------------------------------------------------------
// 列表过滤与列口径
// ---------------------------------------------------------------------------

/** 文章后台列表过滤：表别名固定 a（分类别名 c）。 */
export function buildArticleAdminFilterSql(input: Record<string, unknown> = {}): AdminFilterSql {
  const clauses: string[] = []
  const params: unknown[] = []

  const keyword = normalizeText(input.keyword).slice(0, MAX_KEYWORD_LENGTH)
  if (keyword) {
    const like = `%${escapeLikePattern(keyword)}%`
    clauses.push(`(
    a.title LIKE ? ESCAPE '!'
    OR a.summary LIKE ? ESCAPE '!'
    OR a.slug LIKE ? ESCAPE '!'
  )`)
    params.push(like, like, like)
  }

  const categoryId = toNullableId(input.categoryId)
  if (categoryId !== null) {
    clauses.push('a.category_id = ?')
    params.push(categoryId)
  }

  const status = readContentStatus(input.status)
  if (status) {
    clauses.push('a.status = ?')
    params.push(status)
  }

  // 侧边栏管理：sidebar=1 只看侧边栏文章，sidebar=0 只看非侧边栏文章。
  // 其它取值（含空串）一律忽略，避免误传参数把列表筛空。
  const sidebar = normalizeText(input.sidebar)
  if (sidebar === '1' || sidebar === '0') {
    clauses.push('a.show_in_sidebar = ?')
    params.push(Number(sidebar))
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}

/**
 * 案例后台列表过滤：表别名固定 c。
 * 查询参数 `status` 与 `publishStatus` 都按 publish_status 过滤（后台列表按发布状态筛选，
 * 内部 status 不进入前台列）；非法取值一律忽略，不返回误导性的空列表。
 */
export function buildCaseAdminFilterSql(input: Record<string, unknown> = {}): AdminFilterSql {
  const clauses: string[] = []
  const params: unknown[] = []

  const keyword = normalizeText(input.keyword).slice(0, MAX_KEYWORD_LENGTH)
  if (keyword) {
    const like = `%${escapeLikePattern(keyword)}%`
    clauses.push(`(
    c.case_number LIKE ? ESCAPE '!'
    OR c.plaintiff LIKE ? ESCAPE '!'
    OR c.title LIKE ? ESCAPE '!'
    OR c.court LIKE ? ESCAPE '!'
    OR EXISTS (
      SELECT 1 FROM case_brands cb
      JOIN brands b ON b.id = cb.brand_id
      WHERE cb.case_id = c.id AND b.name LIKE ? ESCAPE '!'
    )
    OR EXISTS (
      SELECT 1 FROM case_law_firms clf
      JOIN law_firms lf ON lf.id = clf.law_firm_id
      WHERE clf.case_id = c.id AND lf.name LIKE ? ESCAPE '!'
    )
  )`)
    params.push(like, like, like, like, like, like)
  }

  const publishStatus = readPublishStatus(input.status) || readPublishStatus(input.publishStatus)
  if (publishStatus) {
    clauses.push('c.publish_status = ?')
    params.push(publishStatus)
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}

/** 品牌 / 律所后台列表过滤：表别名固定 e。 */
export function buildEntityAdminFilterSql(input: Record<string, unknown> = {}): AdminFilterSql {
  const clauses: string[] = []
  const params: unknown[] = []

  const keyword = normalizeText(input.keyword).slice(0, MAX_KEYWORD_LENGTH)
  if (keyword) {
    const like = `%${escapeLikePattern(keyword)}%`
    clauses.push(`(
    e.name LIKE ? ESCAPE '!'
    OR e.name_en LIKE ? ESCAPE '!'
    OR e.slug LIKE ? ESCAPE '!'
    OR e.aliases LIKE ? ESCAPE '!'
  )`)
    params.push(like, like, like, like)
  }

  const status = filterEntityStatus(input.status)
  if (status !== null) {
    clauses.push('e.status = ?')
    params.push(status)
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}

/** 文章列表 / 详情共用列口径（published_at、updated_at 统一格式化成字符串）。 */
export const ADMIN_ARTICLE_COLUMNS = `a.id, a.slug, a.title, COALESCE(a.summary, '') AS summary,
  a.category_id,
  c.name AS category_name,
  DATE_FORMAT(a.published_at, '%Y-%m-%d %H:%i:%s') AS published_at,
  a.status, a.is_featured, a.show_in_sidebar,
  DATE_FORMAT(a.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at`

const ADMIN_ARTICLE_FROM = `articles a
LEFT JOIN article_categories c ON c.id = a.category_id`

export const ADMIN_ARTICLE_LIST_SQL = `SELECT ${ADMIN_ARTICLE_COLUMNS}
FROM ${ADMIN_ARTICLE_FROM}
WHERE 1 = 1`

export const ADMIN_ARTICLE_COUNT_SQL = `SELECT COUNT(*) AS total
FROM ${ADMIN_ARTICLE_FROM}
WHERE 1 = 1`

export const ADMIN_ARTICLE_DETAIL_SQL = `SELECT ${ADMIN_ARTICLE_COLUMNS}, COALESCE(a.content_html, '') AS content_html
FROM ${ADMIN_ARTICLE_FROM}
WHERE a.id = ?
LIMIT 1`

/** 案例列表 / 详情共用列口径；品牌 / 律所 / 侵权类型各取一条用于列表展示。 */
export const ADMIN_CASE_COLUMNS = `c.id, c.case_number,
  DATE_FORMAT(c.filed_at, '%Y-%m-%d') AS filed_at,
  c.plaintiff, c.court,
  c.status, c.publish_status,
  DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
  (
    SELECT b.name FROM case_brands cb
    JOIN brands b ON b.id = cb.brand_id
    WHERE cb.case_id = c.id
    ORDER BY b.id LIMIT 1
  ) AS brand_name,
  (
    SELECT lf.name FROM case_law_firms clf
    JOIN law_firms lf ON lf.id = clf.law_firm_id
    WHERE clf.case_id = c.id
    ORDER BY clf.is_primary DESC, lf.id LIMIT 1
  ) AS law_firm_name,
  (
    SELECT ip.slug FROM case_ip_types cip
    JOIN ip_types ip ON ip.id = cip.ip_type_id
    WHERE cip.case_id = c.id
    ORDER BY ip.sort_order, ip.id LIMIT 1
  ) AS ip_type_slug`

export const ADMIN_CASE_LIST_SQL = `SELECT ${ADMIN_CASE_COLUMNS}
FROM cases c
WHERE 1 = 1`

export const ADMIN_CASE_COUNT_SQL = `SELECT COUNT(*) AS total
FROM cases c
WHERE 1 = 1`

export const ADMIN_CASE_DETAIL_SQL = `SELECT ${ADMIN_CASE_COLUMNS}, c.title,
  (SELECT cb.brand_id FROM case_brands cb WHERE cb.case_id = c.id ORDER BY cb.brand_id LIMIT 1) AS brand_id,
  (
    SELECT clf.law_firm_id FROM case_law_firms clf
    WHERE clf.case_id = c.id
    ORDER BY clf.is_primary DESC, clf.law_firm_id LIMIT 1
  ) AS law_firm_id,
  (
    SELECT cip.ip_type_id FROM case_ip_types cip
    WHERE cip.case_id = c.id
    ORDER BY cip.ip_type_id LIMIT 1
  ) AS ip_type_id
FROM cases c
WHERE c.id = ?
LIMIT 1`

/** 品牌 / 律所：只接受这两张表名，列口径与关联统计在此固定。 */
export type AdminEntityTable = 'brands' | 'law_firms'

export const ADMIN_ENTITY_TABLES: readonly AdminEntityTable[] = Object.freeze(['brands', 'law_firms'])

interface EntitySpec {
  /** 关联表与指向本实体 id 的列，用于实时统计 caseCount。 */
  relationTable: string
  relationColumn: string
  /** region 只有律所有实列。 */
  regionSelect: string
}

const ENTITY_SPECS: Readonly<Record<AdminEntityTable, EntitySpec>> = Object.freeze({
  brands: { relationTable: 'case_brands', relationColumn: 'brand_id', regionSelect: `'' AS region` },
  law_firms: { relationTable: 'case_law_firms', relationColumn: 'law_firm_id', regionSelect: 'e.region' },
})

function entitySpec(table: string): EntitySpec {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_SPECS, table)) throw new Error(`不支持的内容实体：${table}`)
  return ENTITY_SPECS[table as AdminEntityTable]
}

/**
 * 品牌 / 律所列口径。
 * caseCount 是只读派生值：这里从关联表实时统计，而不是读可能过期的 case_count 冗余列，
 * 因此后台看到的数字一定与「案件关联」一致（公开接口仍读 case_count 列）。
 */
export function adminEntityListSql(table: AdminEntityTable): string {
  const spec = entitySpec(table)
  return `SELECT e.id, e.slug, e.name, e.name_en, e.aliases, ${spec.regionSelect},
  COALESCE(e.summary, '') AS summary, e.status,
  DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  DATE_FORMAT(e.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
  (SELECT COUNT(*) FROM ${spec.relationTable} r WHERE r.${spec.relationColumn} = e.id) AS case_count
FROM ${table} e
WHERE 1 = 1`
}

export function adminEntityDetailSql(table: AdminEntityTable): string {
  return `${adminEntityListSql(table)}
  AND e.id = ?
LIMIT 1`
}

/** 品牌 / 律所总数统计；与列表复用同一份过滤片段。 */
export function adminEntityCountSql(table: AdminEntityTable): string {
  entitySpec(table)
  return `SELECT COUNT(*) AS total
FROM ${table} e
WHERE 1 = 1`
}

// ---------------------------------------------------------------------------
// 行映射
// ---------------------------------------------------------------------------

/** 后台文章列表项（契约 task7 §二）。 */
export interface AdminArticleItem {
  id: number
  slug: string
  title: string
  summary: string
  categoryId: number | null
  categoryName: string
  publishedAt: string
  status: ContentStatus | ''
  isFeatured: boolean
  /** 是否在首页侧栏「推荐阅读」中显示（后台侧边栏管理用它筛选） */
  showInSidebar: boolean
  updatedAt: string
}

export interface AdminArticleRow {
  id?: unknown
  slug?: unknown
  title?: unknown
  summary?: unknown
  category_id?: unknown
  category_name?: unknown
  published_at?: unknown
  status?: unknown
  is_featured?: unknown
  show_in_sidebar?: unknown
  updated_at?: unknown
  content_html?: unknown
}

/** 数据库行 → 后台文章列表项；NULL 文本一律收敛成 ''，categoryId 保留 null 表示未分类。 */
export function mapAdminArticleRow(row: AdminArticleRow): AdminArticleItem {
  return {
    id: toId(row.id),
    slug: toText(row.slug),
    title: toText(row.title),
    summary: toText(row.summary),
    categoryId: toNullableId(row.category_id),
    categoryName: toText(row.category_name),
    publishedAt: toDateTimeText(row.published_at),
    status: readContentStatus(row.status),
    isFeatured: toBooleanFlag(row.is_featured),
    showInSidebar: toBooleanFlag(row.show_in_sidebar),
    updatedAt: toDateTimeText(row.updated_at),
  }
}

/** 后台文章详情：列表字段 + 原始正文 HTML（不清洗）。 */
export interface AdminArticleDetail extends AdminArticleItem {
  contentHtml: string
}

export function mapAdminArticleDetail(row: AdminArticleRow): AdminArticleDetail {
  return {
    ...mapAdminArticleRow(row),
    contentHtml: typeof row.content_html === 'string' ? row.content_html : '',
  }
}

/** 后台案例列表项（契约 task7 §二）。 */
export interface AdminCaseItem {
  id: number
  caseNumber: string
  filedAt: string
  plaintiff: string
  lawFirm: string
  brand: string
  court: string
  /** ip_types.slug 原值（trademark / copyright / patent / unknown），未关联时为空串。 */
  caseType: string
  /** cases.status 内部状态原值。 */
  status: CaseInternalStatus | ''
  publishStatus: PublishStatus | ''
  updatedAt: string
}

export interface AdminCaseRow {
  id?: unknown
  case_number?: unknown
  filed_at?: unknown
  plaintiff?: unknown
  court?: unknown
  title?: unknown
  status?: unknown
  publish_status?: unknown
  updated_at?: unknown
  brand_name?: unknown
  law_firm_name?: unknown
  ip_type_slug?: unknown
  brand_id?: unknown
  law_firm_id?: unknown
  ip_type_id?: unknown
}

/**
 * 数据库行 → 后台案例列表项。
 * NULL 的 filed_at / plaintiff / 关联名一律映射成 ''，绝不把 undefined / null 漏给界面。
 */
export function mapAdminCaseRow(row: AdminCaseRow): AdminCaseItem {
  return {
    id: toId(row.id),
    caseNumber: toText(row.case_number),
    filedAt: toDateText(row.filed_at),
    plaintiff: toText(row.plaintiff),
    lawFirm: toText(row.law_firm_name),
    brand: toText(row.brand_name),
    court: toText(row.court),
    caseType: toText(row.ip_type_slug).toLowerCase(),
    status: readCaseStatus(row.status),
    publishStatus: readPublishStatus(row.publish_status),
    updatedAt: toDateTimeText(row.updated_at),
  }
}

/** 后台案例详情：列表字段 + 可编辑字段与当前关联 id。 */
export interface AdminCaseDetail extends AdminCaseItem {
  title: string
  brandId: number | null
  lawFirmId: number | null
  ipTypeId: number | null
}

export function mapAdminCaseDetail(row: AdminCaseRow): AdminCaseDetail {
  return {
    ...mapAdminCaseRow(row),
    title: toText(row.title),
    brandId: toNullableId(row.brand_id),
    lawFirmId: toNullableId(row.law_firm_id),
    ipTypeId: toNullableId(row.ip_type_id),
  }
}

/** 后台品牌 / 律所列表项。region 只有律所有值，品牌恒为 ''。 */
export interface AdminEntityItem {
  id: number
  slug: string
  name: string
  nameEn: string
  aliases: string
  region: string
  summary: string
  /** 只读：由 case_brands / case_law_firms 实时统计，不接受后台写入。 */
  caseCount: number
  status: 0 | 1
  createdAt: string
  updatedAt: string
}

export interface AdminEntityRow {
  id?: unknown
  slug?: unknown
  name?: unknown
  name_en?: unknown
  aliases?: unknown
  region?: unknown
  summary?: unknown
  case_count?: unknown
  status?: unknown
  created_at?: unknown
  updated_at?: unknown
}

export function mapAdminEntityRow(row: AdminEntityRow): AdminEntityItem {
  return {
    id: toId(row.id),
    slug: toText(row.slug),
    name: toText(row.name),
    nameEn: toText(row.name_en),
    aliases: toText(row.aliases),
    region: toText(row.region),
    summary: toText(row.summary),
    caseCount: toCount(row.case_count),
    status: readEntityStatus(row.status) ?? 0,
    createdAt: toDateTimeText(row.created_at),
    updatedAt: toDateTimeText(row.updated_at),
  }
}
