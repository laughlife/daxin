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
  /** 律所专用：简称（law_firms.short_name）；品牌不返回。 */
  shortName?: string
  /** 律所专用：地址（law_firms.address）。 */
  address?: string
  /** 律所专用：官网（law_firms.website）。 */
  website?: string
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
  ipCategory: string
  brandOwner: string
  plaintiff: string
  lawFirm: string
  stateCode: string
  caseTypes: Array<'trademark' | 'patent' | 'copyright'>
}

/** 品牌库分页结果：一次查询同时拿当前页与命中总数，避免为取总数再跑一遍全量匹配。 */
export interface BrandDirectoryPage {
  items: BrandDirectoryEntry[]
  total: number
}

type EntityRow = {
  id: number | string | null
  slug: string | null
  name: string | null
  description: string | null
  case_count: number | string | null
  short_name?: string | null
  address?: string | null
  website?: string | null
}

type BrandDirectoryRow = EntityRow & {
  logo_url: string | null
  ip_category: string | null
  brand_owner: string | null
  plaintiff: string | null
  law_firm: string | null
  state_code: string | null
  case_types: string | null
}

type CaseRow = CaseRowInput & { id: number | string | null }

/**
 * 小程序采集的品牌 / 律所图片成对入库：
 *   - `/images/marks/*.webp` 为带「大信」水印的版本（封面与 Logo 也都在这个目录）；
 *   - `/images/images/*.png` 是同一张的无水印清晰版。
 * 公开页只展示带水印的一张，否则同一张图会在画廊里出现两次。
 */
const WATERMARKED_ENTITY_IMAGE_SQL = `image_url LIKE '%/images/marks/%'`

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

/**
 * 品牌 / 律所与案件的文本匹配规则（目录、详情、关联案件数共用这一份定义）。
 *
 * 采集已不再写 case_brands / case_law_firms，两边靠文本对齐：
 * - 英文主干（生成列 `*_latin`，已转小写且只保留字母数字）双向包含，或前 6 位相同；
 * - 中文名称去空格后双向包含；品牌另看 aliases，律所另看简称 short_name；
 * - 律所简称的英文主干按前 6 位参与匹配。
 *
 * 用 LOCATE 而不是 LIKE：两者在 utf8mb4_unicode_ci 下都按排序规则比较（大小写不敏感），
 * 但 LOCATE 把 `%`/`_` 当普通字符，名称里带这些符号时不会误判成通配符。
 *
 * 入参是「列表达式」而不是固定列名，方便调用方按需传入原始列或已归一化的派生列：
 * 品牌目录要把归一化结果物化后复用（见 brandDirectoryCte），单实体统计则直接拼表达式。
 */
interface EntityCaseMatchColumns {
  /** 案件侧英文主干：cases.brand_latin / cases.firm_latin */
  caseLatin: string
  /** 案件侧去空格名称：REPLACE(TRIM(cases.brand_name), ' ', '') 等 */
  caseNameKey: string
  /** 目录侧英文主干：brands/law_firms.name_latin */
  entityLatin: string
  /** 目录侧去空格名称 */
  entityNameKey: string
  /** 律所简称英文主干（law_firms.short_latin），可选 */
  entityShortLatin?: string
  /** 律所简称去空格（law_firms.short_name），可选 */
  entityShortNameKey?: string
  /** 品牌别名去空格（brands.aliases），可选 */
  entityAliasesKey?: string
}

function entityCaseMatchSql(columns: EntityCaseMatchColumns): string {
  const latinRules = [
    `LOCATE(${columns.caseLatin}, ${columns.entityLatin}) > 0`,
    `LOCATE(${columns.entityLatin}, ${columns.caseLatin}) > 0`,
    `LEFT(${columns.entityLatin}, 6) = LEFT(${columns.caseLatin}, 6)`,
  ]
  if (columns.entityShortLatin) {
    latinRules.push(`(${columns.entityShortLatin} <> '' AND LEFT(${columns.entityShortLatin}, 6) = LEFT(${columns.caseLatin}, 6))`)
  }

  const nameRules = [
    `LOCATE(${columns.caseNameKey}, ${columns.entityNameKey}) > 0`,
    `LOCATE(${columns.entityNameKey}, ${columns.caseNameKey}) > 0`,
  ]
  if (columns.entityShortNameKey) {
    nameRules.push(`(${columns.entityShortNameKey} <> '' AND LOCATE(${columns.caseNameKey}, ${columns.entityShortNameKey}) > 0)`)
  }
  if (columns.entityAliasesKey) {
    nameRules.push(`(${columns.entityAliasesKey} <> '' AND LOCATE(${columns.caseNameKey}, ${columns.entityAliasesKey}) > 0)`)
  }

  return `(
    (CHAR_LENGTH(${columns.caseLatin}) >= 4 AND CHAR_LENGTH(${columns.entityLatin}) >= 4
      AND (${latinRules.join('\n        OR ')}))
    OR (CHAR_LENGTH(${columns.caseNameKey}) >= 2 AND (${nameRules.join('\n        OR ')}))
  )`
}

/** 目录侧（别名 e）与案件侧（别名 c）的匹配条件，供单实体统计使用。 */
function entityCaseMatchSqlForEntity(table: 'brands' | 'law_firms'): string {
  return table === 'brands'
    ? entityCaseMatchSql({
      caseLatin: 'c.brand_latin',
      caseNameKey: `REPLACE(TRIM(c.brand_name), ' ', '')`,
      entityLatin: 'e.name_latin',
      entityNameKey: `REPLACE(e.name, ' ', '')`,
      entityAliasesKey: `REPLACE(e.aliases, ' ', '')`,
    })
    : entityCaseMatchSql({
      caseLatin: 'c.firm_latin',
      caseNameKey: `REPLACE(TRIM(c.law_firm_name), ' ', '')`,
      entityLatin: 'e.name_latin',
      entityNameKey: `REPLACE(e.name, ' ', '')`,
      entityShortLatin: 'e.short_latin',
      entityShortNameKey: `REPLACE(e.short_name, ' ', '')`,
    })
}

/**
 * 品牌 / 律所的公开关联案件数：只统计已发布案件，随发布状态实时变化。
 * 关联表 case_brands / case_law_firms 已停止写入，这里直接按文本匹配。
 */
function publishedEntityCaseCountSql(table: 'brands' | 'law_firms'): string {
  return `(SELECT COUNT(DISTINCT c.id)
    FROM cases c
    WHERE c.publish_status = 'published' AND ${entityCaseMatchSqlForEntity(table)})`
}

/** 品牌 / 律所列表实时计算公开关联案件数，避免状态变更后沿用过期的冗余计数。 */
export async function findEntitySummaries(table: 'brands' | 'law_firms', keyword = ''): Promise<EntitySummary[]> {
  // 表名只来自字面量联合类型，不含用户输入；关键词走 ? 占位符。
  const filters = ['e.status = 1']
  const params: unknown[] = []
  if (keyword.trim()) {
    const like = `%${keyword.trim()}%`
    if (table === 'law_firms') {
      // 律所：全称、简称或英文名任意包含
      filters.push('(e.name LIKE ? OR e.short_name LIKE ? OR e.name_en LIKE ?)')
      params.push(like, like, like)
    } else {
      filters.push('(e.name LIKE ? OR e.name_en LIKE ? OR e.aliases LIKE ?)')
      params.push(like, like, like)
    }
  }
  // 律所目录额外展示小程序来源的简称 / 地址 / 官网；品牌没有这些列，不查。
  // 列表不展示图片（图片只在详情页），因此这里不再查询 logo_url。
  const firmColumns = table === 'law_firms'
    ? `,
            COALESCE(e.short_name, '') AS short_name,
            COALESCE(e.address, '') AS address,
            COALESCE(e.website, '') AS website`
    : ''
  const rows = await queryTarget<EntityRow>(
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description,
            ${publishedEntityCaseCountSql(table)} AS case_count${firmColumns}
     FROM ${table} e
     WHERE ${filters.join(' AND ')}
     ORDER BY 5 DESC, e.name ASC, e.id ASC`,
    params,
  )
  return rows.map((row) => {
    const summary = toEntitySummary(row)
    if (table !== 'law_firms') return summary
    return {
      ...summary,
      shortName: toText(row.short_name),
      address: toText(row.address),
      website: toText(row.website),
    }
  })
}

/**
 * 品牌目录的聚合 CTE（brand_case → brand_agg）。
 *
 * 采集不再写 case_brands，品牌和案件只能按文本匹配。若直接在每行上拼匹配表达式，
 * 1695 个品牌 × 2000+ 个已发布案件要跑 6 秒以上，而列表、统计、计数每次请求都要重算。
 * 这里先把两侧去重后物化：REPLACE 之类的归一化只算一次，匹配范围也从
 * 「品牌 × 案件」降到「品牌 × 不同品牌文本」（库内约 690 种），实测每条约 1 秒。
 *
 * brand_agg 只引用 brand_case 一次；关键字命中的案件同样在同一次聚合里标出来
 * （keyword_hit），避免第二次引用 CTE 让整段匹配重算。
 */
function brandDirectoryCte(withKeywordCase: boolean): string {
  const caseColumns = withKeywordCase
    ? `GROUP_CONCAT(DISTINCT ip.slug ORDER BY ip.sort_order SEPARATOR ',') AS case_types,
           MAX(CASE WHEN c.case_number LIKE ? OR c.law_firm_name LIKE ? THEN 1 ELSE 0 END) AS keyword_hit`
    : `GROUP_CONCAT(DISTINCT ip.slug ORDER BY ip.sort_order SEPARATOR ',') AS case_types`
  const aggColumns = withKeywordCase ? ',\n           MAX(keyword_hit) AS keyword_hit' : ''
  const rankedColumns = withKeywordCase ? ', keyword_hit' : ''

  return `WITH brand_case AS (
    SELECT b2.id AS brand_id, c.id AS case_id, c.filed_at, c.plaintiff, c.state_code,
           c.law_firm_name,
           ${caseColumns}
    FROM (SELECT DISTINCT id, name, name_latin, aliases,
                 REPLACE(name, ' ', '') AS name_key,
                 REPLACE(aliases, ' ', '') AS aliases_key
          FROM brands WHERE status = 1) b2
    JOIN (SELECT DISTINCT brand_name, brand_latin, REPLACE(TRIM(brand_name), ' ', '') AS brand_key
          FROM cases WHERE publish_status = 'published') ct
      ON ${entityCaseMatchSql({
        caseLatin: 'ct.brand_latin',
        caseNameKey: 'ct.brand_key',
        entityLatin: 'b2.name_latin',
        entityNameKey: 'b2.name_key',
        entityAliasesKey: 'b2.aliases_key',
      })}
    JOIN cases c ON c.publish_status = 'published'
      AND c.brand_name = ct.brand_name AND c.brand_latin = ct.brand_latin
    LEFT JOIN case_ip_types cip ON cip.case_id = c.id
    LEFT JOIN ip_types ip ON ip.id = cip.ip_type_id AND ip.status = 1
    GROUP BY b2.id, c.id, c.filed_at, c.plaintiff, c.state_code, c.law_firm_name
  ),
  brand_agg AS (
    SELECT brand_id, COUNT(*) AS case_count,
           GROUP_CONCAT(case_types SEPARATOR ',') AS case_types,
           MAX(CASE WHEN row_num = 1 THEN plaintiff END) AS plaintiff,
           MAX(CASE WHEN row_num = 1 THEN law_firm_name END) AS law_firm,
           MAX(CASE WHEN row_num = 1 THEN state_code END) AS state_code${aggColumns}
    FROM (
      SELECT brand_id, plaintiff, law_firm_name, state_code, case_types${rankedColumns},
             ROW_NUMBER() OVER (PARTITION BY brand_id
               ORDER BY (filed_at IS NULL) ASC, filed_at DESC, case_id DESC) AS row_num
      FROM brand_case
    ) ranked
    GROUP BY brand_id
  )`
}

/** 关键字在案件号 / 代理律所上的两个 LIKE 参数。 */
function brandKeywordCaseParams(keyword: string): unknown[] {
  return keyword ? [`%${keyword}%`, `%${keyword}%`] : []
}

/** 品牌库全局分类统计；一个品牌即使有多个同类案件也只计一次。 */
export async function findPublicBrandDirectoryStats(): Promise<BrandDirectoryStats> {
  const rows = await queryTarget<{
    total: number | string | null
    trademark: number | string | null
    patent: number | string | null
    copyright: number | string | null
  }>(
    `${brandDirectoryCte(false)}
     SELECT COUNT(*) AS total,
            COALESCE(SUM(FIND_IN_SET('trademark', agg.case_types) > 0), 0) AS trademark,
            COALESCE(SUM(FIND_IN_SET('patent', agg.case_types) > 0), 0) AS patent,
            COALESCE(SUM(FIND_IN_SET('copyright', agg.case_types) > 0), 0) AS copyright
     FROM brand_agg agg`,
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

/** 命中关键词 / 分类过滤的品牌数；只在越界页取总数时单独调用。 */
export async function countPublicBrandDirectoryEntries(query: NormalizedBrandDirectoryQuery): Promise<number> {
  const filter = buildBrandDirectoryFilterSql(query)
  const rows = await queryTarget<{ total: number | string | null }>(
    `${brandDirectoryCte(Boolean(query.keyword))}
     SELECT COUNT(*) AS total
     FROM brands b
     LEFT JOIN brand_agg agg ON agg.brand_id = b.id
     WHERE 1 = 1${filter.sql}`,
    [...brandKeywordCaseParams(query.keyword), ...filter.params],
  )
  return toNumber(rows[0]?.total)
}

/**
 * 分页获取品牌库；卡片信息取最新已发布关联案件，Logo 只读取有效的品牌图片。
 *
 * 总数与当前页由同一条查询返回（COUNT(*) OVER () 在 LIMIT 之前计算），
 * 避免为了分页再跑一遍全量匹配。只有请求页码越界、当前页取不到任何行时，
 * 才额外查一次总数（见上方 countPublicBrandDirectoryEntries）。
 */
export async function findPublicBrandDirectoryPage(
  query: NormalizedBrandDirectoryQuery,
): Promise<BrandDirectoryPage> {
  const filter = buildBrandDirectoryFilterSql(query)
  const rows = await queryTarget<BrandDirectoryRow & { total: number | string | null }>(
    `${brandDirectoryCte(Boolean(query.keyword))}
     SELECT b.id, b.slug, b.name, COALESCE(b.summary, '') AS description,
            COALESCE(NULLIF(b.cover_url, ''), logo.public_url, '') AS logo_url,
            b.ip_category,
            b.brand_owner,
            COALESCE(agg.plaintiff, '') AS plaintiff,
            COALESCE(agg.law_firm, '') AS law_firm,
            COALESCE(agg.state_code, '') AS state_code,
            COALESCE(agg.case_count, 0) AS case_count,
            COALESCE(agg.case_types, '') AS case_types,
            COUNT(*) OVER () AS total
     FROM brands b
     LEFT JOIN media_assets logo ON logo.id = b.logo_media_id AND logo.usage_scope = 'logo' AND logo.deleted_at IS NULL
     LEFT JOIN brand_agg agg ON agg.brand_id = b.id
     WHERE 1 = 1${filter.sql}
     ORDER BY COALESCE(agg.case_count, 0) DESC, b.name ASC, b.id ASC
     LIMIT ? OFFSET ?`,
    [
      ...brandKeywordCaseParams(query.keyword),
      ...filter.params,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ],
  )

  const items = rows.map((row) => {
    const summary = toEntitySummary(row)
    // brand_case 里每种案件先各自 GROUP_CONCAT 类型，聚合后会有重复（trademark,trademark,…）。
    const types = Array.from(new Set(String(row.case_types ?? '').split(',')))
      .filter((value): value is 'trademark' | 'patent' | 'copyright' =>
        value === 'trademark' || value === 'patent' || value === 'copyright')
    return {
      ...summary,
      logoUrl: toText(row.logo_url),
      ipCategory: toText(row.ip_category),
      brandOwner: toText(row.brand_owner),
      plaintiff: toText(row.plaintiff),
      lawFirm: toText(row.law_firm),
      stateCode: toText(row.state_code),
      caseTypes: types,
    }
  })

  if (rows.length > 0) return { items, total: toNumber(rows[0]?.total) }
  // 越界页（offset 超过结果数）不会返回任何行，COUNT(*) OVER () 也就读不到；
  // 这种情况只在手工改 URL 页码时出现，单独查一次总数即可。
  if (query.page <= 1) return { items, total: 0 }
  return { items, total: await countPublicBrandDirectoryEntries(query) }
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

/** 品牌详情页资料；介绍与多图来自小程序采集（entity_details / entity_images）。 */
export interface BrandProfile {
  slug: string
  name: string
  description: string
  caseCount: number
  /** 品牌分类：商标 / 专利 / 版权图片 / 奢侈大牌 …（小程序字段） */
  ipCategory: string
  /** 品牌方 */
  brandOwner: string
  /** 起诉类型（小程序字段，通常与分类一致） */
  lawsuitType: string
  /** 最新一条关联公开案件的原告 */
  plaintiff: string
  /** 最新一条关联公开案件的代理律所；缺失时回退到小程序记录的默认律所 */
  lawFirm: string
  /** 最新一条关联公开案件的起诉州 */
  stateCode: string
  /** 封面图：优先 brands.cover_url，其次旧的 logo 媒体资源 */
  coverUrl: string
  /** 富文本简介（未清洗，输出前由 toSafeRichText 处理） */
  intro: string
  /** 品牌图片，按 sort_order 排序 */
  images: string[]
}

type BrandProfileRow = EntityRow & {
  cover_url: string | null
  ip_category: string | null
  brand_owner: string | null
  lawsuit_type: string | null
  default_law_firm: string | null
}

/**
 * 品牌详情资料。
 *
 * 除 brands 自身字段外：
 *   - 原告 / 代理律所 / 起诉州取「最新一条关联公开案件」，与目录卡片同一套文本匹配；
 *   - 介绍取 entity_details.intro，图片取 entity_images（小程序采集，一个品牌最多几十张）。
 * 品牌不存在或未启用返回 null。
 */
export async function findPublicBrandProfile(
  slug: string,
): Promise<{ id: number; brand: BrandProfile } | null> {
  const rows = await queryTarget<BrandProfileRow>(
    // 别名必须是 e：publishedEntityCaseCountSql 内部按 e 引用品牌表。
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description,
            COALESCE(NULLIF(e.cover_url, ''), logo.public_url, '') AS cover_url,
            e.ip_category,
            e.brand_owner,
            e.lawsuit_type,
            e.default_law_firm,
            ${publishedEntityCaseCountSql('brands')} AS case_count
     FROM brands e
     LEFT JOIN media_assets logo ON logo.id = e.logo_media_id AND logo.usage_scope = 'logo' AND logo.deleted_at IS NULL
     WHERE e.status = 1 AND e.slug = ?
     LIMIT 1`,
    [slug],
  )
  const row = rows[0]
  if (!row) return null

  const id = toNumber(row.id)
  const [latestRows, detailRows, imageRows] = await Promise.all([
    // 最新一条关联案件：与目录/详情列表同样的匹配规则，NULL 日期排最后。
    queryTarget<{ plaintiff: string | null; law_firm_name: string | null; state_code: string | null }>(
      `SELECT c.plaintiff, c.law_firm_name, c.state_code
       FROM cases c
       JOIN brands e ON e.id = ? AND e.status = 1
       WHERE c.publish_status = 'published' AND ${entityCaseMatchSqlForEntity('brands')}
       ORDER BY (c.filed_at IS NULL) ASC, c.filed_at DESC, c.id DESC
       LIMIT 1`,
      [id],
    ),
    queryTarget<{ intro: string | null }>(
      `SELECT intro FROM entity_details WHERE entity_type = 'brand' AND entity_id = ? LIMIT 1`,
      [id],
    ),
    queryTarget<{ image_url: string | null }>(
      `SELECT image_url FROM entity_images
       WHERE entity_type = 'brand' AND entity_id = ? AND image_url <> ''
         AND ${WATERMARKED_ENTITY_IMAGE_SQL}
       ORDER BY sort_order, id`,
      [id],
    ),
  ])

  const latest = latestRows[0]
  return {
    id,
    brand: {
      slug: toText(row.slug),
      name: toText(row.name),
      description: toText(row.description),
      caseCount: toNumber(row.case_count),
      ipCategory: toText(row.ip_category),
      brandOwner: toText(row.brand_owner),
      lawsuitType: toText(row.lawsuit_type),
      plaintiff: toText(latest?.plaintiff),
      lawFirm: toText(latest?.law_firm_name) || toText(row.default_law_firm),
      stateCode: toText(latest?.state_code),
      coverUrl: toText(row.cover_url),
      intro: toText(detailRows[0]?.intro),
      images: imageRows.map(item => toText(item.image_url)).filter(Boolean),
    },
  }
}

/** 律所详情页资料；介绍与多图同样来自小程序采集。 */
export interface FirmProfile {
  slug: string
  name: string
  description: string
  caseCount: number
  /** 简称（law_firms.short_name），列表与详情都会展示 */
  shortName: string
  address: string
  website: string
  /** Logo / 首页图：优先 law_firms.logo_url，其次第一张采集图 */
  logoUrl: string
  /** 富文本简介（未清洗，输出前由 toSafeRichText 处理） */
  intro: string
  /** 律所图片，按 sort_order 排序 */
  images: string[]
}

type FirmProfileRow = EntityRow & {
  short_name: string | null
  address: string | null
  website: string | null
  logo_url: string | null
}

/**
 * 律所详情资料：律所自身字段 + 关联案件数（文本匹配）+ 简介 + 图片。
 * 律所不存在或未启用返回 null。
 */
export async function findPublicFirmProfile(
  slug: string,
): Promise<{ id: number; firm: FirmProfile } | null> {
  const rows = await queryTarget<FirmProfileRow>(
    // 别名必须是 e：publishedEntityCaseCountSql 内部按 e 引用律所表。
    `SELECT e.id, e.slug, e.name, COALESCE(e.summary, '') AS description,
            COALESCE(e.short_name, '') AS short_name,
            COALESCE(e.address, '') AS address,
            COALESCE(e.website, '') AS website,
            COALESCE(e.logo_url, '') AS logo_url,
            ${publishedEntityCaseCountSql('law_firms')} AS case_count
     FROM law_firms e
     WHERE e.status = 1 AND e.slug = ?
     LIMIT 1`,
    [slug],
  )
  const row = rows[0]
  if (!row) return null

  const id = toNumber(row.id)
  const [detailRows, imageRows] = await Promise.all([
    queryTarget<{ intro: string | null }>(
      `SELECT intro FROM entity_details WHERE entity_type = 'law_firm' AND entity_id = ? LIMIT 1`,
      [id],
    ),
    queryTarget<{ image_url: string | null }>(
      `SELECT image_url FROM entity_images
       WHERE entity_type = 'law_firm' AND entity_id = ? AND image_url <> ''
         AND ${WATERMARKED_ENTITY_IMAGE_SQL}
       ORDER BY sort_order, id`,
      [id],
    ),
  ])

  const images = imageRows.map(item => toText(item.image_url)).filter(Boolean)
  return {
    id,
    firm: {
      slug: toText(row.slug),
      name: toText(row.name),
      description: toText(row.description),
      caseCount: toNumber(row.case_count),
      shortName: toText(row.short_name),
      address: toText(row.address),
      website: toText(row.website),
      logoUrl: toText(row.logo_url) || images[0] || '',
      intro: toText(detailRows[0]?.intro),
      images,
    },
  }
}

/** 某个品牌 / 律所下已发布的案件。 */
export async function findCasesForEntity(
  relation: 'brand' | 'law_firm',
  entityId: number,
): Promise<CaseRecord[]> {
  if (!Number.isInteger(entityId) || entityId <= 0) return []
  const table: 'brands' | 'law_firms' = relation === 'brand' ? 'brands' : 'law_firms'
  // 关联表 case_brands / case_law_firms 已停止写入：按与列表一致的文本规则找该实体名下的案件。
  const rows = await queryTarget<CaseRow>(
    `SELECT ${CASE_COLUMNS}
     FROM cases c
     JOIN ${table} e ON e.id = ? AND e.status = 1
     WHERE c.publish_status = 'published' AND ${entityCaseMatchSqlForEntity(table)}
     ${CASE_ORDER_BY}`,
    [entityId],
  )
  return mapCaseRows(rows)
}
