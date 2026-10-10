// 核验队列的纯函数层：状态/类型归一化、行映射、回填值校验与语句拼装。
//
// 这些函数不访问数据库、不依赖 Nuxt 运行时，因此可以在 node:test 中直接单测
// （见 web/scripts/admin-review.test.mjs）。
//
// 安全约定（重要）：
//   - `applyValue` 允许回填的「实体 + 字段 → 目标列」是硬编码白名单，
//     请求里的 `fieldName` 只用于在白名单里查表，绝不参与 SQL 拼装；
//   - 返回的 `column` 永远是白名单常量，未知组合一律拒绝，不存在动态列名注入路径；
//   - 语句里除白名单列名外只有 `?` 占位符，值一律走参数数组。
//
// 实现说明：本模块刻意不 import 其他 server 工具（运行时依赖只有类型），
// 因为 node:test 直接加载 .ts 时按 Node 的类型擦除规则解析，
// 不会做 Nuxt/Vite 那样的无扩展名/别名解析，跨模块 import 会导致测试无法运行。
import type { SqlConnection } from '../db/pool'

/** 核验项状态，与 migration_review_items.status 取值一致。 */
export const REVIEW_STATUSES = ['open', 'confirmed', 'rejected'] as const

/** 回填目标实体，与 migration_review_items.entity_type 取值一致。 */
export const REVIEW_ENTITY_TYPES = ['case', 'article', 'brand', 'law_firm', 'ip_type', 'media'] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export type ReviewEntityType = (typeof REVIEW_ENTITY_TYPES)[number]

/** PUT 允许写入的状态：open 不能被主动设置，只能由 confirmed/rejected 进入终态。 */
export const RESOLVABLE_REVIEW_STATUSES = ['confirmed', 'rejected'] as const

export type ResolvableReviewStatus = (typeof RESOLVABLE_REVIEW_STATUSES)[number]

/** 回填涉及的实体；两者都可通过既有 schema 定位到目标行。 */
export type ApplyEntity = 'case' | 'article'

/** 回填涉及的列名，全部是字面量类型，保证来源只能是本文件的白名单。 */
export type ApplyColumn = 'plaintiff' | 'filed_at'

export type ReviewRow = {
  id?: number | string | null
  entity_type?: string | null
  legacy_source_table?: string | null
  legacy_source_id?: number | string | null
  field_name?: string | null
  candidate_value?: string | null
  normalized_value?: string | null
  context_snippet?: string | null
  confidence?: number | string | null
  status?: string | null
  resolved_at?: Date | string | null
  resolution_note?: string | null
}

export type ReviewItem = {
  id: number
  entityType: string
  legacySourceTable: string
  legacySourceId: number
  fieldName: string
  candidateValue: string
  normalizedValue: string
  contextSnippet: string
  confidence: number
  status: string
  resolvedAt: string
  resolutionNote: string
}

export type ApplyValidation =
  | { ok: true; column: ApplyColumn; value: string | null }
  | { ok: false; code: string; message: string }

export type ApplyStatement = {
  /** 目标列名，来自白名单常量（绝不出自请求）。 */
  column: ApplyColumn
  sql: string
  params: unknown[]
}

/** plaintiff 与 cases.plaintiff 的列长度一致（VARCHAR(255)）。 */
const MAX_PLAINTIFF_LENGTH = 255

const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}:\d{2}/

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 文本归一化：合并连续空白并去掉首尾空白；非字符串返回空串。
 * 与 server/utils/public/query.ts 的同名实现保持一致（此处内联以保证本模块可被 node:test 直接加载）。
 */
function normalizeText(value: unknown): string {
  const picked = Array.isArray(value) ? (value.find(item => typeof item === 'string') ?? value[0]) : value
  return typeof picked === 'string' ? picked.replace(/\s+/g, ' ').trim() : ''
}

/** 只接受真实存在的 YYYY-MM-DD，其余（含 2024-02-31）返回空串。 */
function normalizeDateOnly(value: unknown): string {
  const text = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid ? text : ''
}

/**
 * 状态归一化：大小写不敏感（先 trim 再 toLowerCase），
 * 空值 / 非字符串 / 未知取值回落到 'open'，未知状态由查询层当作「全部」筛选。
 */
export function normalizeReviewStatus(value: unknown): ReviewStatus | '' {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 'open'
  return (REVIEW_STATUSES as readonly string[]).includes(text) ? text as ReviewStatus : ''
}

/** 实体类型归一化：大小写不敏感；空值 / 未知取值返回空串（查询层当作不筛选）。 */
export function normalizeEntityType(value: unknown): ReviewEntityType | '' {
  const text = normalizeText(value).toLowerCase()
  return (REVIEW_ENTITY_TYPES as readonly string[]).includes(text) ? text as ReviewEntityType : ''
}

/** 待处理状态归一化：只接受 confirmed / rejected，其余返回空串。 */
export function normalizeResolvableStatus(value: unknown): ResolvableReviewStatus | '' {
  const text = normalizeText(value).toLowerCase()
  return (RESOLVABLE_REVIEW_STATUSES as readonly string[]).includes(text) ? text as ResolvableReviewStatus : ''
}

/**
 * 时间格式化：输出 'YYYY-MM-DD HH:mm:ss'（本地时区，与库内 DATETIME 展示一致）；
 * NULL / 空 / 非法时间返回空串。刻意不用 toISOString，避免把库内本地时间漂移成 UTC。
 */
export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} `
      + `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`
  }
  const text = String(value).trim()
  if (DATE_TIME_PATTERN.test(text)) return text.slice(0, 19)
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : formatDateTime(date)
}

/** 把数据库行映射为契约里的核验项结构；所有字段都有兜底，confidence 为数值。 */
export function mapReviewRow(row: ReviewRow | null | undefined): ReviewItem {
  const source = row ?? {}
  return {
    id: toNumber(source.id),
    entityType: String(source.entity_type ?? ''),
    legacySourceTable: String(source.legacy_source_table ?? ''),
    legacySourceId: toNumber(source.legacy_source_id),
    fieldName: String(source.field_name ?? ''),
    candidateValue: String(source.candidate_value ?? ''),
    normalizedValue: String(source.normalized_value ?? ''),
    contextSnippet: String(source.context_snippet ?? ''),
    confidence: toNumber(source.confidence),
    status: String(source.status ?? ''),
    resolvedAt: formatDateTime(source.resolved_at),
    resolutionNote: String(source.resolution_note ?? ''),
  }
}

/**
 * 校验回填请求。
 *
 * 白名单（与契约「三、核验队列」一致，且已在本库只读核查中验证可落到具体表/列）：
 *   case + plaintiff → cases.plaintiff（非空字符串，长度 <= 255）
 *   case + filedAt   → cases.filed_at（'YYYY-MM-DD' 或显式清空）
 *
 * 其余任何 `entityType + fieldName` 组合（含 article + title、case + caseNumber）一律拒绝，
 * 并返回中文说明，不存在把请求字段当列名的分支。
 */
export function validateApplyValue(input: {
  entityType?: unknown
  fieldName?: unknown
  applyValue?: unknown
}): ApplyValidation {
  const entityType = normalizeText(input?.entityType).toLowerCase()
  const fieldName = normalizeText(input?.fieldName)

  if (entityType === 'case' && fieldName === 'plaintiff') {
    if (typeof input.applyValue !== 'string') {
      return { ok: false, code: 'INVALID_APPLY_VALUE', message: '原告名称必须是字符串' }
    }
    const value = input.applyValue.trim()
    if (!value) {
      return { ok: false, code: 'INVALID_APPLY_VALUE', message: '原告名称不能为空' }
    }
    if (value.length > MAX_PLAINTIFF_LENGTH) {
      return { ok: false, code: 'INVALID_APPLY_VALUE', message: `原告名称不能超过 ${MAX_PLAINTIFF_LENGTH} 个字符` }
    }
    return { ok: true, column: 'plaintiff', value }
  }

  if (entityType === 'case' && fieldName === 'filedAt') {
    if (input.applyValue === null || input.applyValue === undefined || input.applyValue === '') {
      return { ok: true, column: 'filed_at', value: null }
    }
    if (typeof input.applyValue !== 'string') {
      return { ok: false, code: 'INVALID_APPLY_VALUE', message: '立案日期必须是 YYYY-MM-DD 格式的字符串' }
    }
    // 允许带时间的输入，但只取日期部分；最终仍须通过严格的 YYYY-MM-DD 校验。
    const date = normalizeDateOnly(input.applyValue.slice(0, 10))
    if (!date) {
      return { ok: false, code: 'INVALID_APPLY_VALUE', message: '立案日期格式不正确，应为 YYYY-MM-DD' }
    }
    return { ok: true, column: 'filed_at', value: date }
  }

  return {
    ok: false,
    code: 'UNSUPPORTED_APPLY_FIELD',
    message: `不支持将「${entityType || '未知实体'} / ${fieldName || '未知字段'}」回填到业务表`,
  }
}

/** 解析「核验项来源 → 目标业务行」的固定 SQL；语句、表名、关联列全部是常量。 */
export function resolveTargetStatement(target: { entityType: string; legacySourceTable: string }): {
  entity: ApplyEntity
  sql: string
} | null {
  const entityType = normalizeText(target?.entityType).toLowerCase()
  if (entityType === 'case') {
    return {
      entity: 'case',
      sql: `SELECT cs.case_id AS id
              FROM case_sources cs
             WHERE cs.source_table = ? AND cs.source_id = ?
             GROUP BY cs.case_id
             ORDER BY cs.case_id ASC`,
    }
  }
  if (entityType === 'article') {
    return {
      entity: 'article',
      sql: `SELECT a.id AS id
              FROM articles a
             WHERE a.legacy_source_table = ? AND a.legacy_source_id = ?
             ORDER BY a.id ASC`,
    }
  }
  return null
}

/**
 * 拼装回填语句。
 *
 * 仅接受 `{ entity: 'case', caseId, column, value }`：列名与表名都是本模块常量，
 * `caseId` 与 `value` 全部进入参数数组；`column` 不是白名单取值时直接抛错。
 */
export function buildApplyStatements(input: {
  target?: unknown
  caseId?: unknown
  column?: unknown
  value?: unknown
}): ApplyStatement {
  const target = normalizeText(input?.target)
  const column = normalizeText(input?.column)
  const caseId = toNumber(input?.caseId)

  if (target !== 'case' || (column !== 'plaintiff' && column !== 'filed_at') || !Number.isInteger(caseId) || caseId <= 0) {
    throw new Error('回填语句参数不合法：仅支持 cases 表的 plaintiff / filed_at')
  }

  return {
    column,
    sql: `UPDATE cases SET \`${column}\` = ?, updated_at = NOW() WHERE id = ?`,
    params: [input.value ?? null, caseId],
  }
}

/** 在给定连接（事务内）执行回填语句，返回受影响行数。 */
export async function applyCaseValue(
  connection: SqlConnection,
  input: { caseId?: unknown; column?: unknown; value?: unknown },
): Promise<number> {
  const statement = buildApplyStatements({ target: 'case', ...input })
  const [result] = await connection.execute(statement.sql, statement.params)
  const affected = (result as { affectedRows?: number } | undefined)?.affectedRows
  return typeof affected === 'number' ? affected : 0
}
