// 公开接口的纯函数层：分页夹取、查询参数解析、案件过滤条件拼装。
//
// 这些函数不访问数据库、不依赖 Nuxt 运行时，因此可以在 node:test 中直接单测
// （见 web/scripts/public-api.test.mjs）。所有 SQL 片段只由常量与 ? 占位符组成，
// 用户输入一律进入参数数组，绝不做字符串拼接。
import type { CaseType } from '~/types/content'

/** 列表默认每页条数。 */
export const DEFAULT_PAGE_SIZE = 12
/** 服务端每页条数上限，避免一次拉取过多数据。 */
export const MAX_PAGE_SIZE = 48
/** TRO 案件查询页按产品要求每页最多展示 50 条。 */
export const MAX_CASE_PAGE_SIZE = 50

/** CaseRecord.caseType 支持的取值，与 web/app/types/content.ts 保持一致。 */
export const SUPPORTED_CASE_TYPES: readonly CaseType[] = ['trademark', 'patent', 'copyright']

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const INTEGER_PATTERN = /^[+-]?\d+(?:\.\d+)?$/

/** 解析输入中的单个值：h3 的 query 可能给出数组，取第一个字符串。 */
function pick(value: unknown): unknown {
  if (Array.isArray(value)) return value.find(item => typeof item === 'string') ?? value[0]
  return value
}

/** 解析整数：非数字、空串、NaN 一律返回 null，浮点按截断处理。 */
function parseInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text || !INTEGER_PATTERN.test(text)) return null
    const parsed = Number(text)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

/** 页码：缺省、非法或小于 1 一律夹到 1（不报错）。 */
export function normalizePage(value: unknown): number {
  const parsed = parseInteger(pick(value))
  return parsed === null || parsed < 1 ? 1 : parsed
}

/**
 * 每页条数：缺省 / 非法（空串、"abc"）回落为 12；显式给出的 0、负数按下限 1 处理；
 * 超过对应上限后会夹取（普通公开列表为 48，TRO 案件列表为 50）。
 */
export function normalizePageSize(value: unknown, maxPageSize = MAX_PAGE_SIZE): number {
  const parsed = parseInteger(pick(value))
  if (parsed === null) return DEFAULT_PAGE_SIZE
  if (parsed < 1) return 1
  return Math.min(parsed, maxPageSize)
}

/** 文本归一化：合并连续空白并去掉首尾空白；非字符串返回空串。 */
export function normalizeText(value: unknown): string {
  const picked = pick(value)
  return typeof picked === 'string' ? picked.replace(/\s+/g, ' ').trim() : ''
}

/** 只接受 YYYY-MM-DD 且为真实存在的日期，其余（含 2024-02-31）返回空串。 */
export function normalizeDateOnly(value: unknown): string {
  const text = normalizeText(value)
  if (!DATE_ONLY_PATTERN.test(text)) return ''
  const parts = text.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const date = new Date(Date.UTC(year, month - 1, day))
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid ? text : ''
}

/** 案件类型：只接受三种已知类型，其余返回空串（视为未筛选）。 */
export function normalizeCaseType(value: unknown): CaseType | '' {
  const text = normalizeText(value).toLowerCase()
  return (SUPPORTED_CASE_TYPES as readonly string[]).includes(text) ? text as CaseType : ''
}

/** 归一化后的案件列表查询条件；空值统一表示为空串或默认分页值。 */
export interface NormalizedCaseQuery {
  keyword: string
  caseType: CaseType | ''
  state: string
  from: string
  to: string
  page: number
  pageSize: number
}

/** 品牌库列表查询条件。 */
export interface NormalizedBrandDirectoryQuery {
  keyword: string
  caseType: CaseType | ''
  page: number
  pageSize: number
}

/** 解析品牌库查询参数；品牌库每页默认 20 条，最大 50 条。 */
export function parseBrandDirectoryQuery(input?: Record<string, unknown> | null): NormalizedBrandDirectoryQuery {
  const source = input ?? {}
  const rawPageSize = pick(source.pageSize)
  return {
    keyword: normalizeText(source.keyword ?? source.q),
    caseType: normalizeCaseType(source.caseType ?? source.type),
    page: normalizePage(source.page),
    pageSize: rawPageSize === undefined || rawPageSize === null || rawPageSize === ''
      ? 20
      : normalizePageSize(rawPageSize, MAX_CASE_PAGE_SIZE),
  }
}

/** 构造品牌列表过滤条件；关键词匹配品牌、关联公开案件号和代理律所。 */
export function buildBrandDirectoryFilterSql(query: NormalizedBrandDirectoryQuery): CaseFilterSql {
  const clauses: string[] = ['b.status = 1']
  const params: unknown[] = []

  if (query.keyword) {
    const like = `%${query.keyword}%`
    clauses.push(`(
      b.name LIKE ?
      OR b.name_en LIKE ?
      OR b.aliases LIKE ?
      OR EXISTS (
        SELECT 1
        FROM cases c
        WHERE c.publish_status = 'published'
          AND (
            c.brand_name = b.name
            OR c.brand_name LIKE CONCAT('%', b.name, '%')
            OR b.name LIKE CONCAT('%', c.brand_name, '%')
          )
          AND (c.case_number LIKE ? OR c.law_firm_name LIKE ?)
      )
    )`)
    params.push(like, like, like, like, like)
  }

  if (query.caseType) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM case_brands cb
      JOIN cases c ON c.id = cb.case_id AND c.publish_status = 'published'
      JOIN case_ip_types cip ON cip.case_id = c.id
      JOIN ip_types ip ON ip.id = cip.ip_type_id AND ip.status = 1
      WHERE cb.brand_id = b.id AND ip.slug = ?
    )`)
    params.push(query.caseType)
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}

/**
 * 解析案件列表查询参数。任何输入都不会被“拒绝”，只会被归一化：
 * 空值 / 非法值被丢弃，合法值按原样保留。
 */
export function parseCaseQuery(input?: Record<string, unknown> | null): NormalizedCaseQuery {
  const source = input ?? {}
  return {
    keyword: normalizeText(source.keyword),
    caseType: normalizeCaseType(source.caseType),
    state: normalizeText(source.state),
    from: normalizeDateOnly(source.from),
    to: normalizeDateOnly(source.to),
    page: normalizePage(source.page),
    pageSize: normalizePageSize(source.pageSize, MAX_CASE_PAGE_SIZE),
  }
}

/** 分页窗口：夹取后的页码与偏移量。 */
export interface PageWindow {
  page: number
  pageSize: number
  total: number
  totalPages: number
  offset: number
  /**
   * 请求页码超出最后一页。调用方拿到 true 时应直接返回空数组，不再查库，
   * 这样既能保持“越界页返回空数据”，又不会把 page 显示成 999/9。
   */
  beyondLastPage: boolean
}

/**
 * 依据总数夹取分页窗口。
 * - total 为 0 时返回 page=1、totalPages=1、offset=0（空列表也有稳定的第 1 页）；
 * - 请求页超过最后一页时返回空数据的窗口：page 夹到最后一页，beyondLastPage=true；
 * - 因此永远不会出现 page > totalPages。
 */
export function resolvePageWindow(total: number, page: unknown, pageSize: unknown, maxPageSize = MAX_PAGE_SIZE): PageWindow {
  const normalizedSize = normalizePageSize(pageSize, maxPageSize)
  const requestedPage = normalizePage(page)
  const safeTotal = typeof total === 'number' && Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0

  if (safeTotal === 0) {
    return { page: 1, pageSize: normalizedSize, total: 0, totalPages: 1, offset: 0, beyondLastPage: false }
  }

  const totalPages = Math.max(1, Math.ceil(safeTotal / normalizedSize))
  if (requestedPage > totalPages) {
    return {
      page: totalPages,
      pageSize: normalizedSize,
      total: safeTotal,
      totalPages,
      offset: (totalPages - 1) * normalizedSize,
      beyondLastPage: true,
    }
  }

  return {
    page: requestedPage,
    pageSize: normalizedSize,
    total: safeTotal,
    totalPages,
    offset: (requestedPage - 1) * normalizedSize,
    beyondLastPage: false,
  }
}

/**
 * 过滤出可安全用于 IN (?, ?, ...) 的正整数 id，并去重。
 * PostgreSQL/MySQL 都不接受把数组作为单个占位符，这里先把 id 收敛成数字再拼占位符，
 * 因此拼接进 SQL 的只有 ? 本身，不含任何原始输入。
 */
export function toSafeNumericIds(values: readonly unknown[]): number[] {
  const ids = new Set<number>()
  for (const value of values) {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
    if (Number.isInteger(parsed) && parsed > 0) ids.add(parsed)
  }
  return [...ids]
}

/** 生成 IN 子句的占位符，个数由已校验的数字 id 数量决定。 */
export function placeholdersFor(ids: readonly unknown[]): string {
  return ids.map(() => '?').join(', ')
}

export interface CaseFilterSql {
  /** 以 " AND ..." 开头（可能是空串）的过滤片段，可直接拼在 WHERE 1 = 1 之后。 */
  sql: string
  params: unknown[]
}

/**
 * 拼装案件过滤条件（表别名固定为 c）。
 * 只返回条件与参数，不包含 SELECT / ORDER BY，便于列表与 COUNT 复用同一份条件。
 *
 * 说明：
 * - 只返回 publish_status = 'published' 的公开数据；
 * - keyword 命中案件号、原告，或关联品牌名、关联律所名；
 * - caseType 走 case_ip_types + ip_types.slug（当前库该关联表为空，命中即为空结果）；
 * - state 目前无对应列（cases 表没有起诉州），接口接受该参数但无法用于过滤，故此处忽略。
 */
export function buildCaseFilterSql(query: NormalizedCaseQuery): CaseFilterSql {
  const clauses: string[] = [`c.publish_status = 'published'`]
  const params: unknown[] = []

  if (query.keyword) {
    const like = `%${query.keyword}%`
    clauses.push(`(
    c.case_number LIKE ?
    OR c.plaintiff LIKE ?
    OR EXISTS (
      SELECT 1 FROM case_brands cb
      JOIN brands b ON b.id = cb.brand_id
      WHERE cb.case_id = c.id AND b.name LIKE ?
    )
    OR EXISTS (
      SELECT 1 FROM case_law_firms clf
      JOIN law_firms lf ON lf.id = clf.law_firm_id
      WHERE clf.case_id = c.id AND lf.name LIKE ?
    )
  )`)
    params.push(like, like, like, like)
  }

  if (query.caseType) {
    clauses.push(`EXISTS (
    SELECT 1 FROM case_ip_types cip
    JOIN ip_types ip ON ip.id = cip.ip_type_id
    WHERE cip.case_id = c.id AND ip.slug = ?
  )`)
    params.push(query.caseType)
  }

  if (query.from) {
    clauses.push('c.filed_at >= ?')
    params.push(query.from)
  }

  if (query.to) {
    clauses.push('c.filed_at <= ?')
    params.push(query.to)
  }

  return { sql: clauses.map(clause => `\n  AND ${clause}`).join(''), params }
}
