// 公开案件 / 品牌 / 律所的数据读取层。
//
// 约定：
//   - 所有 SQL 通过 queryTarget 执行，用户输入一律走 ? 占位符；
//   - 列表先查主表拿到当前页的 id，再用一次 IN (?, ?, ...) 批量补齐品牌 / 律所 / 侵权类型 /
//     来源文章，避免逐条查库（N+1）；
//   - 日期列统一用 DATE_FORMAT 取字符串，避免 mysql2 把 DATE 转成 Date 后受服务器时区影响；
//   - 内部迁移列（migration_batch_id / legacy_source_* / verified_at 等）一律不 SELECT。
import { queryTarget } from '../db/query'
import {
  buildCaseFilterSql,
  placeholdersFor,
  toSafeNumericIds,
  type NormalizedCaseQuery,
  type PageWindow,
} from './query'
import {
  mapCaseRecord,
  type CaseRowInput,
  type CaseSourceInput,
} from './case-mapper'
import type { CaseRecord } from '../../../app/types/content'

/** 品牌 / 律所列表项；与 web/app/repositories/entities.ts 的 BrandSummary / FirmSummary 结构一致。 */
export interface EntitySummary {
  slug: string
  name: string
  description: string
  caseCount: number
}

type EntityRow = {
  id: number | string | null
  slug: string | null
  name: string | null
  description: string | null
  case_count: number | string | null
}

type CaseRow = CaseRowInput & { id: number | string | null }

type RelationRow = {
  case_id: number | string | null
  value: string | null
}

type IpTypeRow = {
  case_id: number | string | null
  slug: string | null
}

type SourceRow = {
  case_id: number | string | null
  source_table: string | null
  article_id: number | string | null
  title: string | null
  published_at: string | null
  excerpt: string | null
}

const CASE_COLUMNS = `c.id,
  c.case_number,
  DATE_FORMAT(c.filed_at, '%Y-%m-%d') AS filed_at,
  c.plaintiff,
  c.summary`

/** NULL 日期排在最后，其余按起诉时间倒序、案件号倒序。 */
const CASE_ORDER_BY = 'ORDER BY (c.filed_at IS NULL) ASC, c.filed_at DESC, c.case_number DESC'

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toEntitySummary(row: EntityRow): EntitySummary {
  return {
    slug: toText(row.slug),
    name: toText(row.name),
    description: toText(row.description),
    caseCount: toNumber(row.case_count),
  }
}

/** 按 case_id 归并关联行，保持 SQL 给出的顺序。 */
function groupValues(rows: RelationRow[]): Map<number, string[]> {
  const grouped = new Map<number, string[]>()
  for (const row of rows) {
    const caseId = toNumber(row.case_id)
    const value = toText(row.value)
    if (caseId <= 0 || !value) continue
    const list = grouped.get(caseId)
    if (list) list.push(value)
    else grouped.set(caseId, [value])
  }
  return grouped
}

interface CaseRelations {
  brandNames: Map<number, string[]>
  lawFirmNames: Map<number, string[]>
  ipTypeSlugs: Map<number, string[]>
  sources: Map<number, CaseSourceInput>
}

/** 用 4 条批量查询替代逐条查询：无论一页多少条，关联查询次数恒定为 4。 */
async function loadCaseRelations(ids: number[]): Promise<CaseRelations> {
  if (ids.length === 0) {
    return { brandNames: new Map(), lawFirmNames: new Map(), ipTypeSlugs: new Map(), sources: new Map() }
  }

  const placeholders = placeholdersFor(ids)

  const [brandRows, firmRows, ipRows, sourceRows] = await Promise.all([
    queryTarget<RelationRow>(
      `SELECT cb.case_id AS case_id, b.name AS value
       FROM case_brands cb
       JOIN brands b ON b.id = cb.brand_id
       WHERE cb.case_id IN (${placeholders}) AND b.status = 1
       ORDER BY cb.case_id, b.id`,
      ids,
    ),
    // is_primary DESC 让主代理律所排在第一个，映射层取 [0] 即为代理律所。
    queryTarget<RelationRow>(
      `SELECT clf.case_id AS case_id, lf.name AS value
       FROM case_law_firms clf
       JOIN law_firms lf ON lf.id = clf.law_firm_id
       WHERE clf.case_id IN (${placeholders}) AND lf.status = 1
       ORDER BY clf.case_id, clf.is_primary DESC, lf.id`,
      ids,
    ),
    queryTarget<IpTypeRow>(
      `SELECT cip.case_id AS case_id, ip.slug AS slug
       FROM case_ip_types cip
       JOIN ip_types ip ON ip.id = cip.ip_type_id
       WHERE cip.case_id IN (${placeholders}) AND ip.status = 1
       ORDER BY cip.case_id, ip.sort_order, ip.id`,
      ids,
    ),
    // 只公开已发布文章的来源信息，草稿文章不对外暴露。
    queryTarget<SourceRow>(
      `SELECT cs.case_id AS case_id,
              cs.source_table AS source_table,
              a.id AS article_id,
              a.title AS title,
              DATE_FORMAT(a.published_at, '%Y-%m-%d') AS published_at,
              a.summary AS excerpt
       FROM case_sources cs
       JOIN articles a ON a.legacy_source_table = cs.source_table AND a.legacy_source_id = cs.source_id
       WHERE cs.case_id IN (${placeholders}) AND a.status = 'published'
       ORDER BY cs.case_id, a.id`,
      ids,
    ),
  ])

  const sources = new Map<number, CaseSourceInput>()
  for (const row of sourceRows) {
    const caseId = toNumber(row.case_id)
    // 一个案件可能关联多篇文章，只保留第一篇（ORDER BY a.id）。
    if (caseId <= 0 || sources.has(caseId)) continue
    sources.set(caseId, {
      articleId: toNumber(row.article_id),
      title: row.title,
      publishedAt: row.published_at,
      table: row.source_table,
      excerpt: row.excerpt,
    })
  }

  return {
    brandNames: groupValues(brandRows),
    lawFirmNames: groupValues(firmRows),
    ipTypeSlugs: groupValues(ipRows.map(row => ({ case_id: row.case_id, value: row.slug }))),
    sources,
  }
}

/** 批量映射当前页的案件行；关联数据只查一次。 */
async function mapCaseRows(rows: CaseRow[]): Promise<CaseRecord[]> {
  if (rows.length === 0) return []
  const ids = toSafeNumericIds(rows.map(row => row.id))
  const relations = await loadCaseRelations(ids)
  return rows.map((row) => {
    const caseId = toNumber(row.id)
    return mapCaseRecord(row, {
      brandNames: relations.brandNames.get(caseId) ?? [],
      lawFirmNames: relations.lawFirmNames.get(caseId) ?? [],
      ipTypeSlugs: relations.ipTypeSlugs.get(caseId) ?? [],
      source: relations.sources.get(caseId) ?? null,
    })
  })
}

/** 命中过滤条件的已发布案件总数。 */
export async function countPublishedCases(query: NormalizedCaseQuery): Promise<number> {
  const filter = buildCaseFilterSql(query)
  const rows = await queryTarget<{ total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM cases c
     WHERE 1 = 1${filter.sql}`,
    filter.params,
  )
  return toNumber(rows[0]?.total)
}

/** 当前页的已发布案件；越界页返回空数组且不再查库。 */
export async function findPublishedCasePage(query: NormalizedCaseQuery, window: PageWindow): Promise<CaseRecord[]> {
  if (window.beyondLastPage) return []
  const filter = buildCaseFilterSql(query)
  const rows = await queryTarget<CaseRow>(
    `SELECT ${CASE_COLUMNS}
     FROM cases c
     WHERE 1 = 1${filter.sql}
     ${CASE_ORDER_BY}
     LIMIT ? OFFSET ?`,
    [...filter.params, window.pageSize, window.offset],
  )
  return mapCaseRows(rows)
}

/** 按案件号（不区分大小写）查已发布案件详情。 */
export async function findPublishedCaseByNumber(caseNumber: string): Promise<CaseRecord | null> {
  const rows = await queryTarget<CaseRow>(
    `SELECT ${CASE_COLUMNS}
     FROM cases c
     WHERE c.publish_status = 'published' AND LOWER(c.case_number) = LOWER(?)
     LIMIT 1`,
    [caseNumber],
  )
  const [first] = rows
  if (!first) return null
  const [record] = await mapCaseRows([first])
  return record ?? null
}

/** 品牌 / 律所列表。caseCount 直接取 case_count 列（不实时重算）。 */
export async function findEntitySummaries(table: 'brands' | 'law_firms'): Promise<EntitySummary[]> {
  // 表名只来自字面量联合类型，不含用户输入。
  const rows = await queryTarget<EntityRow>(
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description, e.case_count
     FROM ${table} e
     WHERE e.status = 1
     ORDER BY e.case_count DESC, e.name ASC, e.id ASC`,
    [],
  )
  return rows.map(toEntitySummary)
}

/** 单个品牌 / 律所，找不到返回 null。 */
export async function findEntityBySlug(
  table: 'brands' | 'law_firms',
  slug: string,
): Promise<{ id: number; summary: EntitySummary } | null> {
  const rows = await queryTarget<EntityRow>(
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description, e.case_count
     FROM ${table} e
     WHERE e.status = 1 AND e.slug = ?
     LIMIT 1`,
    [slug],
  )
  const [first] = rows
  if (!first) return null
  return { id: toNumber(first.id), summary: toEntitySummary(first) }
}

/** 某个品牌 / 律所下已发布的案件。 */
export async function findCasesForEntity(
  relation: 'brand' | 'law_firm',
  entityId: number,
): Promise<CaseRecord[]> {
  if (!Number.isInteger(entityId) || entityId <= 0) return []
  const rows = relation === 'brand'
    ? await queryTarget<CaseRow>(
      `SELECT ${CASE_COLUMNS}
       FROM cases c
       JOIN case_brands cb ON cb.case_id = c.id
       WHERE cb.brand_id = ? AND c.publish_status = 'published'
       ${CASE_ORDER_BY}`,
      [entityId],
    )
    : await queryTarget<CaseRow>(
      `SELECT ${CASE_COLUMNS}
       FROM cases c
       JOIN case_law_firms clf ON clf.case_id = c.id
       WHERE clf.law_firm_id = ? AND c.publish_status = 'published'
       ${CASE_ORDER_BY}`,
      [entityId],
    )
  return mapCaseRows(rows)
}
