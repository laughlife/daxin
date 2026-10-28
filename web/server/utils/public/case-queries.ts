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
  buildBrandDirectoryFilterSql,
  placeholdersFor,
  type NormalizedBrandDirectoryQuery,
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

/** 品牌库分类统计；按有公开案件关联的去重品牌数统计。 */
export interface BrandDirectoryStats {
  total: number
  trademark: number
  patent: number
  copyright: number
}

/** 品牌库列表记录。 */
export interface BrandDirectoryEntry extends EntitySummary {
  logoUrl: string
  plaintiff: string
  lawFirm: string
  stateCode: string
  caseTypes: Array<'trademark' | 'patent' | 'copyright'>
}

type EntityRow = {
  id: number | string | null
  slug: string | null
  name: string | null
  description: string | null
  case_count: number | string | null
}

type BrandDirectoryRow = EntityRow & {
  logo_url: string | null
  plaintiff: string | null
  law_firm: string | null
  state_code: string | null
  case_types: string | null
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
  article_id: number | string | null
  slug: string | null
  title: string | null
}

const CASE_COLUMNS = `c.id,
  c.case_number,
  DATE_FORMAT(c.filed_at, '%Y-%m-%d') AS filed_at,
  c.plaintiff,
  c.brand_name,
  c.law_firm_name`

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
              a.id AS article_id,
              a.slug AS slug,
              a.title AS title
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
      slug: row.slug,
      title: row.title,
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
/**
 * 案件列表附加信息：是否已有进展、品牌/律所是否能在目录里匹配到。
 *
 * 匹配用双向 LIKE：案件里存的是采集原始文本（如「Keith A. Vogt / JiangIP LLC」或「Keith」），
 * 品牌库/律所目录里可能是全称或简称，两边互相包含即视为同一主体。
 */
async function loadCaseExtras(ids: number[]) {
  const extras = new Map<number, { hasEvents: boolean; brandSlug: string; firmSlug: string }>()
  if (ids.length === 0) return extras
  const rows = await queryTarget<{
    id: number | string
    has_events: number | string | null
    brand_slug: string | null
    firm_slug: string | null
  }>(
    `SELECT c.id,
            EXISTS (SELECT 1 FROM case_events e WHERE e.case_id = c.id) AS has_events,
            (
              SELECT b.slug FROM brands b
              WHERE b.status = 1 AND (
                -- 英文主干：互相包含
                (CHAR_LENGTH(c.brand_latin) >= 4 AND CHAR_LENGTH(b.name_latin) >= 4 AND (
                  b.name_latin LIKE CONCAT('%', c.brand_latin, '%')
                  OR c.brand_latin LIKE CONCAT('%', b.name_latin, '%')
                  -- 只差构词（rubikcube / rubikscube）：前 6 位相同
                  OR LEFT(b.name_latin, 6) = LEFT(c.brand_latin, 6)
                ))
                -- 中文名称：去空格后互相包含
                OR (CHAR_LENGTH(TRIM(c.brand_name)) >= 2 AND (
                  REPLACE(b.name, ' ', '') LIKE CONCAT('%', REPLACE(TRIM(c.brand_name), ' ', ''), '%')
                  OR REPLACE(TRIM(c.brand_name), ' ', '') LIKE CONCAT('%', REPLACE(b.name, ' ', ''), '%')
                  OR (b.aliases <> '' AND REPLACE(b.aliases, ' ', '') LIKE CONCAT('%', REPLACE(TRIM(c.brand_name), ' ', ''), '%'))
                ))
              )
              ORDER BY
                (b.name_latin = c.brand_latin) DESC,
                (LEFT(b.name_latin, 6) = LEFT(c.brand_latin, 6)) DESC,
                CHAR_LENGTH(b.name) ASC
              LIMIT 1
            ) AS brand_slug,
            (
              SELECT lf.slug FROM law_firms lf
              WHERE lf.status = 1 AND (
                (CHAR_LENGTH(c.firm_latin) >= 4 AND CHAR_LENGTH(lf.name_latin) >= 4 AND (
                  lf.name_latin LIKE CONCAT('%', c.firm_latin, '%')
                  OR c.firm_latin LIKE CONCAT('%', lf.name_latin, '%')
                  OR LEFT(lf.name_latin, 6) = LEFT(c.firm_latin, 6)
                  OR (lf.short_latin <> '' AND (
                    lf.short_latin LIKE CONCAT('%', c.firm_latin, '%')
                    OR c.firm_latin LIKE CONCAT('%', lf.short_latin, '%')
                    OR LEFT(lf.short_latin, 6) = LEFT(c.firm_latin, 6)
                  ))
                ))
                OR (CHAR_LENGTH(TRIM(c.law_firm_name)) >= 2 AND (
                  REPLACE(lf.name, ' ', '') LIKE CONCAT('%', REPLACE(TRIM(c.law_firm_name), ' ', ''), '%')
                  OR REPLACE(TRIM(c.law_firm_name), ' ', '') LIKE CONCAT('%', REPLACE(lf.name, ' ', ''), '%')
                  OR REPLACE(lf.short_name, ' ', '') LIKE CONCAT('%', REPLACE(TRIM(c.law_firm_name), ' ', ''), '%')
                  OR REPLACE(TRIM(c.law_firm_name), ' ', '') LIKE CONCAT('%', REPLACE(lf.short_name, ' ', ''), '%')
                ))
              )
              ORDER BY
                (lf.name_latin = c.firm_latin OR lf.short_latin = c.firm_latin) DESC,
                (LEFT(lf.name_latin, 6) = LEFT(c.firm_latin, 6)) DESC,
                CHAR_LENGTH(lf.name) ASC
              LIMIT 1
            ) AS firm_slug
     FROM cases c
     WHERE c.id IN (${placeholdersFor(ids)})`,
    [...ids],
  )
  for (const row of rows) {
    extras.set(toNumber(row.id), {
      hasEvents: toNumber(row.has_events) === 1,
      brandSlug: toText(row.brand_slug),
      firmSlug: toText(row.firm_slug),
    })
  }
  return extras
}

async function mapCaseRows(rows: CaseRow[]): Promise<CaseRecord[]> {
  if (rows.length === 0) return []
  const ids = toSafeNumericIds(rows.map(row => row.id))
  const [relations, extras] = await Promise.all([loadCaseRelations(ids), loadCaseExtras(ids)])
  return rows.map((row) => {
    const caseId = toNumber(row.id)
    const extra = extras.get(caseId)
    const record = mapCaseRecord(row, {
      brandNames: relations.brandNames.get(caseId) ?? [],
      lawFirmNames: relations.lawFirmNames.get(caseId) ?? [],
      ipTypeSlugs: relations.ipTypeSlugs.get(caseId) ?? [],
      source: relations.sources.get(caseId) ?? null,
    })
    return {
      ...record,
      hasEvents: extra?.hasEvents ?? false,
      brandSlug: extra?.brandSlug ?? '',
      firmSlug: extra?.firmSlug ?? '',
    }
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
  if (!record) return null

  // 详情页附加数据：worldtro 详情抓取结果（可能尚未抓取，缺失时前端整块不渲染）
  const [detailRow] = await queryTarget<{
    source_url: string
    court_full: string
    defendants: unknown
    law_firms: unknown
    brands: unknown
    cause_of_action: string
    frozen_amount: string
    claim_amount: string
    fetch_status: string
  }>(
    `SELECT source_url, court_full, defendants, law_firms, brands,
            cause_of_action, frozen_amount, claim_amount, fetch_status
     FROM case_details WHERE case_id = ? LIMIT 1`,
    [record.id],
  )

  const events = await queryTarget<{ event_date: string | Date | null; event_time: string | null; title: string; description: string | null }>(
    `SELECT event_date, event_time, title, description FROM case_events
     WHERE case_id = ? ORDER BY event_date DESC, id DESC LIMIT 60`,
    [record.id],
  )

  const asList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
    if (typeof value === 'string' && value.trim()) return value.split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean)
    return []
  }

  return {
    ...record,
    detail: {
      courtFull: detailRow?.court_full ?? '',
      defendants: asList(detailRow?.defendants),
      lawFirms: asList(detailRow?.law_firms),
      brands: asList(detailRow?.brands),
      causeOfAction: detailRow?.cause_of_action ?? '',
      frozenAmount: detailRow?.frozen_amount ?? '',
      claimAmount: detailRow?.claim_amount ?? '',
      sourceUrl: detailRow?.source_url ?? '',
      fetchStatus: detailRow?.fetch_status ?? '',
      events: events.map((row) => ({
        // event_date 可能是 Date 对象或 YYYY-MM-DD 字符串，统一格式化，避免出现英文星期
        // DATE 列在 mysql2 里是本地时区的 Date；用 toISOString 会因时区换算少一天，
        // 因此按本地年月日拼接
        date: row.event_date
          ? (row.event_date instanceof Date
              ? `${row.event_date.getFullYear()}-${String(row.event_date.getMonth() + 1).padStart(2, '0')}-${String(row.event_date.getDate()).padStart(2, '0')}`
              : String(row.event_date).slice(0, 10))
          : '',
        time: row.event_time ?? '',
        title: row.title,
        description: row.description ?? '',
      })),
    },
  }
}

/** 品牌 / 律所公开关联案件数：只统计已发布案件，随发布状态实时变化。 */
function publishedEntityCaseCountSql(table: 'brands' | 'law_firms'): string {
  return table === 'brands'
    ? `(SELECT COUNT(DISTINCT c.id)
       FROM case_brands relation
       JOIN cases c ON c.id = relation.case_id AND c.publish_status = 'published'
       WHERE relation.brand_id = e.id)`
    : `(SELECT COUNT(DISTINCT c.id)
       FROM case_law_firms relation
       JOIN cases c ON c.id = relation.case_id AND c.publish_status = 'published'
       WHERE relation.law_firm_id = e.id)`
}

/** 品牌 / 律所列表实时计算公开关联案件数，避免状态变更后沿用过期的冗余计数。 */
export async function findEntitySummaries(table: 'brands' | 'law_firms', keyword = ''): Promise<EntitySummary[]> {
  // 表名只来自字面量联合类型，不含用户输入；关键词走 ? 占位符。
  const filters = ['e.status = 1']
  const params: unknown[] = []
  if (keyword.trim()) {
    const like = `%${keyword.trim()}%`
    if (table === 'law_firms') {
      // 律所：全称或简称任意包含
      filters.push('(e.name LIKE ? OR e.short_name LIKE ? OR e.name_en LIKE ?)')
      params.push(like, like, like)
    } else {
      filters.push('(e.name LIKE ? OR e.name_en LIKE ? OR e.aliases LIKE ?)')
      params.push(like, like, like)
    }
  }
  const rows = await queryTarget<EntityRow>(
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description,
            ${publishedEntityCaseCountSql(table)} AS case_count
     FROM ${table} e
     WHERE ${filters.join(' AND ')}
     ORDER BY 5 DESC, e.name ASC, e.id ASC`,
    params,
  )
  return rows.map(toEntitySummary)
}

/** 品牌库匹配的品牌数（关键词可命中公开案件号、品牌名或代理律所）。 */
export async function countPublicBrandDirectoryEntries(query: NormalizedBrandDirectoryQuery): Promise<number> {
  const filter = buildBrandDirectoryFilterSql(query)
  const rows = await queryTarget<{ total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM brands b
     WHERE 1 = 1${filter.sql}`,
    filter.params,
  )
  return toNumber(rows[0]?.total)
}

/** 品牌库全局分类统计；一个品牌即使有多个同类案件也只计一次。 */
export async function findPublicBrandDirectoryStats(): Promise<BrandDirectoryStats> {
  const rows = await queryTarget<{
    total: number | string | null
    trademark: number | string | null
    patent: number | string | null
    copyright: number | string | null
  }>(
    `SELECT COUNT(DISTINCT b.id) AS total,
            COUNT(DISTINCT CASE WHEN ip.slug = 'trademark' THEN b.id END) AS trademark,
            COUNT(DISTINCT CASE WHEN ip.slug = 'patent' THEN b.id END) AS patent,
            COUNT(DISTINCT CASE WHEN ip.slug = 'copyright' THEN b.id END) AS copyright
     FROM brands b
     LEFT JOIN case_brands cb ON cb.brand_id = b.id
     LEFT JOIN cases c ON c.id = cb.case_id AND c.publish_status = 'published'
     LEFT JOIN case_ip_types cip ON cip.case_id = c.id
     LEFT JOIN ip_types ip ON ip.id = cip.ip_type_id AND ip.status = 1
     WHERE b.status = 1`,
    [],
  )
  const row = rows[0]
  return {
    total: toNumber(row?.total),
    trademark: toNumber(row?.trademark),
    patent: toNumber(row?.patent),
    copyright: toNumber(row?.copyright),
  }
}

/** 分页获取品牌库；卡片信息取最新已发布关联案件，Logo 只读取有效的品牌图片。 */
export async function findPublicBrandDirectoryPage(
  query: NormalizedBrandDirectoryQuery,
  window: PageWindow,
): Promise<BrandDirectoryEntry[]> {
  if (window.beyondLastPage || window.total === 0) return []
  const filter = buildBrandDirectoryFilterSql(query)
  const rows = await queryTarget<BrandDirectoryRow>(
    `SELECT b.id, b.slug, b.name, COALESCE(b.summary, '') AS description,
            COALESCE(logo.public_url, '') AS logo_url,
            COALESCE(latest.plaintiff, '') AS plaintiff,
            COALESCE(latest.law_firm, '') AS law_firm,
            COALESCE(latest.state_code, '') AS state_code,
            COUNT(DISTINCT c.id) AS case_count,
            GROUP_CONCAT(DISTINCT ip.slug ORDER BY ip.sort_order SEPARATOR ',') AS case_types
     FROM brands b
     LEFT JOIN media_assets logo ON logo.id = b.logo_media_id AND logo.usage_scope = 'logo' AND logo.deleted_at IS NULL
     LEFT JOIN (
       SELECT ranked.brand_id, ranked.plaintiff, ranked.law_firm, ranked.state_code
       FROM (
         SELECT cb.brand_id, c.plaintiff, COALESCE(lf.name, '') AS law_firm, c.state_code,
                ROW_NUMBER() OVER (
                  PARTITION BY cb.brand_id
                  ORDER BY (c.filed_at IS NULL) ASC, c.filed_at DESC, c.id DESC, clf.is_primary DESC, lf.name ASC
                ) AS row_num
         FROM case_brands cb
         JOIN cases c ON c.id = cb.case_id AND c.publish_status = 'published'
         LEFT JOIN case_law_firms clf ON clf.case_id = c.id
         LEFT JOIN law_firms lf ON lf.id = clf.law_firm_id AND lf.status = 1
       ) ranked
       WHERE ranked.row_num = 1
     ) latest ON latest.brand_id = b.id
     LEFT JOIN case_brands cb ON cb.brand_id = b.id
     LEFT JOIN cases c ON c.id = cb.case_id AND c.publish_status = 'published'
     LEFT JOIN case_ip_types cip ON cip.case_id = c.id
     LEFT JOIN ip_types ip ON ip.id = cip.ip_type_id AND ip.status = 1
     WHERE 1 = 1${filter.sql}
     GROUP BY b.id, b.slug, b.name, b.summary, logo.public_url, latest.plaintiff, latest.law_firm, latest.state_code
     ORDER BY 9 DESC, b.name ASC, b.id ASC
     LIMIT ? OFFSET ?`,
    [...filter.params, window.pageSize, window.offset],
  )
  return rows.map((row) => {
    const summary = toEntitySummary(row)
    const types = String(row.case_types ?? '').split(',')
      .filter((value): value is 'trademark' | 'patent' | 'copyright' =>
        value === 'trademark' || value === 'patent' || value === 'copyright')
    return {
      ...summary,
      logoUrl: toText(row.logo_url),
      plaintiff: toText(row.plaintiff),
      lawFirm: toText(row.law_firm),
      stateCode: toText(row.state_code),
      caseTypes: types,
    }
  })
}

/** 单个品牌 / 律所，找不到返回 null。 */
export async function findEntityBySlug(
  table: 'brands' | 'law_firms',
  slug: string,
): Promise<{ id: number; summary: EntitySummary } | null> {
  const liveCount = publishedEntityCaseCountSql(table)
  const rows = await queryTarget<EntityRow>(
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description, ${liveCount} AS case_count
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
