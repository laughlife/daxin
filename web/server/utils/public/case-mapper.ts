// 数据库行 → CaseRecord 的唯一映射入口。
//
// 列表、详情、品牌详情、律所详情都复用这里的 mapCaseRecord，保证字段口径一致。
// 该文件不访问数据库、不依赖 Nuxt 运行时，可在 node:test 中直接单测。
import type { CaseRecord, CaseType } from '../../../app/types/content'

/** 与既有 Mock 约定一致的中文类型标签（web/app/data/mock/cases.ts 的 CASE_TYPE_LABELS）。 */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  trademark: '商标',
  patent: '专利',
  copyright: '版权',
}

/**
 * 未标注侵权类型时的展示文案。
 *
 * 旧站正文没有侵权类型字段，case_ip_types 已统一回填为 ip_types.unknown（待确认类型），
 * 因此前台必须显示“待确认类型”。绝不能把未标注的案件显示成某个具体类型
 * （例如商标），那会把“不知道”伪装成事实。
 */
export const UNKNOWN_CASE_TYPE_LABEL = '待确认类型'

/** 供界面使用的类型标签：已知类型返回中文标签，未标注返回“待确认类型”。 */
export function caseTypeLabel(caseType: string | undefined | null): string {
  const key = normalizeText(caseType).toLowerCase() as CaseType
  return CASE_TYPE_LABELS[key] ?? UNKNOWN_CASE_TYPE_LABEL
}

/**
 * 与 CaseType 一致的取值集合。这里不去 import ./query 的常量，是为了让本文件保持
 * 零运行时依赖——node:test 的类型剥离不支持省略扩展名的相对导入，自包含才能直接单测。
 */
const SUPPORTED_CASE_TYPES: readonly string[] = ['trademark', 'patent', 'copyright']

/** 合并连续空白并去掉首尾空白；非字符串返回空串。 */
function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** “近 3 天”口径：起诉日期距今 0～3 个自然日（北京时间）。 */
const RECENT_DAYS = 3

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 数据库日期列：只保留 YYYY-MM-DD，非法值返回空串（不臆造日期）。 */
export function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    // mysql2 会把 DATE 转成“本地零点”的 Date，因此用本地字段还原原始日期。
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
  }
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
    const [, year, month, day] = match ?? []
    return year && month && day ? `${year}-${month}-${day}` : ''
  }
  return ''
}

/** 当前的北京日期（与服务器时区无关）。 */
export function beijingDateOnly(now: Date): string {
  const shifted = new Date(now.getTime() + BEIJING_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

/** filed_at 是否落在最近 3 天内（北京时间）。无日期时为 false。 */
export function isRecentFiledAt(filedAt: string, now: Date = new Date()): boolean {
  if (!filedAt) return false
  const today = Date.parse(`${beijingDateOnly(now)}T00:00:00Z`)
  const filed = Date.parse(`${filedAt}T00:00:00Z`)
  if (Number.isNaN(today) || Number.isNaN(filed)) return false
  const diffDays = Math.round((today - filed) / MS_PER_DAY)
  return diffDays >= 0 && diffDays <= RECENT_DAYS
}

/** cases 表参与映射的列（其余列不对外暴露）。 */
export interface CaseRowInput {
  id: number | string | null
  case_number: string | null
  filed_at: string | Date | null
  plaintiff: string | null
  summary: string | null
}

/** case_sources + articles 关联出的来源信息。 */
export interface CaseSourceInput {
  articleId: number | string | null
  title: string | null
  publishedAt: string | Date | null
  table: string | null
  excerpt: string | null
}

/** 关联数据由调用方批量查出后传入，避免在映射阶段逐条查库（N+1）。 */
export interface CaseRelationsInput {
  brandNames?: readonly string[]
  lawFirmNames?: readonly string[]
  ipTypeSlugs?: readonly string[]
  source?: CaseSourceInput | null
  now?: Date
}

function toIdText(value: number | string | null): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value)
}

function toCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 先按已知类型过滤，再去重并保持数据库给出的顺序（ip_types.sort_order）。 */
function toCaseTypes(slugs: readonly string[] | undefined): CaseType[] {
  if (!slugs || slugs.length === 0) return []
  const result: CaseType[] = []
  for (const slug of slugs) {
    const text = normalizeText(slug).toLowerCase()
    if (!SUPPORTED_CASE_TYPES.includes(text) || result.includes(text as CaseType)) continue
    result.push(text as CaseType)
  }
  return result
}

function mapSource(source: CaseSourceInput | null | undefined): CaseRecord['source'] | undefined {
  if (!source) return undefined
  const title = normalizeText(source.title)
  if (!title) return undefined
  return {
    articleId: toCount(source.articleId),
    title,
    publishedAt: toDateOnly(source.publishedAt),
    table: normalizeText(source.table),
    excerpt: normalizeText(source.excerpt).slice(0, 200),
  }
}

/**
 * 映射一条案件记录。
 *
 * 已确认的数据空缺（不造假数据）：
 * - `state`：cases 表没有起诉州列，固定返回空串；
 * - `status`：cases.status 属内部流转状态（契约要求不对外暴露），固定返回空串；
 * - `tags`：没有标签表，固定返回空数组；
 * - `caseType`：先取 ip_types.slug（数据库中有 trademark / copyright / patent / unknown）；
 *   当前 case_ip_types 关联表为空（0 行），所以所有行都会走到回退分支。回退值取 'trademark'，
 *   同时 caseTypes 保持为真实派生结果（空数组），不做补齐，避免把“未标注”伪装成“商标”。
 *   若后续导入补齐了关联，caseType 会自动使用第一个真实类型。
 * - `category`：由 caseTypes 的中文标签拼接，无类型数据时返回空串，
 *   而不是拼出没有信息量的“侵权”。
 */
export function mapCaseRecord(row: CaseRowInput, relations: CaseRelationsInput = {}): CaseRecord {
  const caseNumber = normalizeText(row.case_number)
  const caseTypes = toCaseTypes(relations.ipTypeSlugs)
  const category = caseTypes.length > 0
    ? `${caseTypes.map(type => CASE_TYPE_LABELS[type]).join(' / ')}侵权`
    : ''

  return {
    id: toIdText(row.id),
    caseNumber,
    filedAt: toDateOnly(row.filed_at),
    lawFirm: normalizeText(relations.lawFirmNames?.[0]),
    plaintiffBrand: normalizeText(relations.brandNames?.[0]),
    state: '',
    caseType: caseTypes[0] ?? 'trademark',
    caseTypes,
    plaintiffName: normalizeText(row.plaintiff),
    source: mapSource(relations.source),
    category,
    status: '',
    summary: normalizeText(row.summary),
    tags: [],
    isRecent: isRecentFiledAt(toDateOnly(row.filed_at), relations.now ?? new Date()),
    slug: caseNumber.toLowerCase(),
  }
}
