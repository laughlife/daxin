import { createHash } from 'node:crypto'
import { getTargetPool, type SqlConnection } from '../db/pool'
import { queryTarget, withTargetTransaction } from '../db/query'
import { crawlWorldTroList } from './crawler.mjs'
import { parseRobotsRules } from './parser.mjs'
import { shanghaiDateKey } from './schedule.mjs'

const SOURCE_KEY = 'worldtro_tro'
const LIST_URL = 'https://worldtro.com/tro'
const USER_AGENT = 'DaxinCaseImporter/1.0 (public case-list, once daily)'
const MAX_ROBOTS_BYTES = 64 * 1024
const MAX_PAGE_BYTES = 8 * 1024 * 1024

type WorldTroCase = {
  caseNumber: string
  filedAt: string
  plaintiff: string
  stateCode: string
  lawFirm: string
  brand: string
  ipType: string
  sourceUrl: string
}

type CountRow = { total: number | string | null }
type IdRow = { id: number | string }
type IpTypeRow = { id: number | string; slug: string }
type RunRow = { status: string }
type DbHeader = { insertId?: number | string; affectedRows?: number }

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function assertWorldTroUrl(urlValue: string): URL {
  const url = new URL(urlValue)
  if (url.protocol !== 'https:' || !['worldtro.com', 'www.worldtro.com'].includes(url.hostname)) {
    throw new Error('WorldTRO 分页地址离开了公开案件列表站点，本次采集已停止')
  }
  return url
}

async function readLimitedText(response: Response, maxBytes: number, label: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error(`${label}超过大小限制`)
  const text = await response.text()
  if (byteLength(text) > maxBytes) throw new Error(`${label}超过大小限制`)
  return text
}

async function getRobotsRules(): Promise<ReturnType<typeof parseRobotsRules>> {
  const response = await fetch('https://worldtro.com/robots.txt', {
    headers: { 'user-agent': USER_AGENT, accept: 'text/plain,*/*;q=0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  if (response.url && !['worldtro.com', 'www.worldtro.com'].includes(new URL(response.url).hostname)) {
    throw new Error('WorldTRO robots.txt 跳转到了其他站点，本次采集已停止')
  }
  if (response.status === 404 || response.status === 410) return parseRobotsRules('', USER_AGENT)
  if (!response.ok) throw new Error(`无法确认 WorldTRO robots.txt 规则（HTTP ${response.status}），本次采集已停止`)
  const text = await readLimitedText(response, MAX_ROBOTS_BYTES, 'WorldTRO robots.txt')
  return parseRobotsRules(text, USER_AGENT)
}

async function fetchListingHtml(urlValue: string, robots: ReturnType<typeof parseRobotsRules>): Promise<string> {
  const url = assertWorldTroUrl(urlValue)
  if (!robots.allowed(url.toString())) throw new Error(`WorldTRO robots.txt 不允许读取 ${url.pathname}，本次采集已停止`)
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  if (response.url) {
    const finalUrl = assertWorldTroUrl(response.url)
    if (!robots.allowed(finalUrl.toString())) throw new Error(`WorldTRO robots.txt 不允许读取最终页面 ${finalUrl.pathname}，本次采集已停止`)
  }
  if (!response.ok) throw new Error(`读取 WorldTRO 案件列表失败（HTTP ${response.status}）`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('WorldTRO 返回内容不是 HTML 案件列表')
  return readLimitedText(response, MAX_PAGE_BYTES, 'WorldTRO 案件列表')
}

function caseParts(caseNumber: string): { year: number; sequence: number; type: string } | null {
  const match = caseNumber.match(/^(\d{2,4})-([a-z]{2})-(\d{1,8})$/i)
  if (!match) return null
  const yearText = match[1] ?? ''
  const type = match[2] ?? ''
  const sequenceText = match[3] ?? ''
  const rawYear = Number(yearText)
  const year = yearText.length === 2 ? 2000 + rawYear : rawYear
  const sequence = Number(sequenceText)
  if (year < 1900 || year > 9999 || !Number.isSafeInteger(sequence) || sequence < 0) return null
  return { year, sequence, type: type.toLowerCase() }
}

function stableEntitySlug(kind: 'brand' | 'law-firm', name: string): string {
  const digest = createHash('sha256').update(name.trim().toLocaleLowerCase('en-US')).digest('hex').slice(0, 20)
  return `worldtro-${kind}-${digest}`
}

function ipTypeSlug(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (/商标|trademark/.test(normalized)) return 'trademark'
  if (/版权|著作权|copyright/.test(normalized)) return 'copyright'
  if (/专利|patent/.test(normalized)) return 'patent'
  return ''
}

async function findOrCreateEntity(
  connection: SqlConnection,
  kind: 'brand' | 'law-firm',
  name: string,
  cache: Map<string, number>,
): Promise<number | null> {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const cacheKey = `${kind}:${normalized.toLocaleLowerCase('en-US')}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const table = kind === 'brand' ? 'brands' : 'law_firms'
  const [found] = await connection.execute(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [normalized])
  const existingId = Number((found as IdRow[])[0]?.id ?? 0)
  if (existingId) {
    cache.set(cacheKey, existingId)
    return existingId
  }

  const slug = stableEntitySlug(kind, normalized)
  await connection.execute(`INSERT IGNORE INTO ${table} (slug, name, status, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())`, [slug, normalized])
  const [created] = await connection.execute(`SELECT id FROM ${table} WHERE slug = ? LIMIT 1`, [slug])
  const id = Number((created as IdRow[])[0]?.id ?? 0)
  if (!id) throw new Error(`创建 ${kind === 'brand' ? '品牌' : '律所'}关联失败`)
  cache.set(cacheKey, id)
  return id
}

async function replaceOldCasesAndEntities(connection: SqlConnection): Promise<void> {
  await connection.execute('DELETE FROM case_related_cases', [])
  await connection.execute('DELETE FROM case_progress', [])
  await connection.execute('DELETE FROM case_sources', [])
  await connection.execute('DELETE FROM case_brands', [])
  await connection.execute('DELETE FROM case_law_firms', [])
  await connection.execute('DELETE FROM case_ip_types', [])
  await connection.execute('DELETE FROM case_ingest_sources', [])
  await connection.execute('DELETE FROM cases', [])
  await connection.execute('DELETE FROM brands', [])
  await connection.execute('DELETE FROM law_firms', [])
}

async function persistCases(cases: WorldTroCase[], initialImport: boolean) {
  return withTargetTransaction(async (connection) => {
    if (initialImport) await replaceOldCasesAndEntities(connection)
    const entityIds = new Map<string, number>()
    const [ipTypeRows] = await connection.execute('SELECT id, slug FROM ip_types WHERE status = 1', [])
    const ipTypes = new Map((ipTypeRows as IpTypeRow[]).map((row) => [row.slug, Number(row.id)]))
    let insertedCount = 0
    let duplicateCount = 0

    for (const item of cases) {
      const parts = caseParts(item.caseNumber)
      if (!parts) throw new Error(`案件号格式不在当前案件表支持范围内：${item.caseNumber}`)
      const [existingRows] = await connection.execute('SELECT id FROM cases WHERE case_number = ? LIMIT 1', [item.caseNumber])
      let caseId = Number((existingRows as IdRow[])[0]?.id ?? 0)

      if (caseId) {
        duplicateCount += 1
        await connection.execute(
          `UPDATE cases SET
             filed_at = COALESCE(filed_at, ?),
             plaintiff = IF(plaintiff = '', ?, plaintiff),
             state_code = IF(state_code = '', ?, state_code),
             updated_at = NOW()
           WHERE id = ?`,
          [item.filedAt || null, item.plaintiff, item.stateCode, caseId],
        )
      } else {
        const [header] = await connection.execute(
          `INSERT INTO cases
             (case_number, case_year, case_seq, case_type, court, state_code, filed_at, plaintiff, title,
              status, publish_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', ?, ?, ?, '', 'open', 'draft', NOW(), NOW())`,
          [item.caseNumber, parts.year, parts.sequence, parts.type, item.stateCode, item.filedAt || null, item.plaintiff],
        )
        caseId = Number((header as DbHeader).insertId ?? 0)
        if (!caseId) throw new Error(`写入案件失败：${item.caseNumber}`)
        insertedCount += 1
      }

      // 详情抓取占位：新入库/已存在的案件都确保进入待抓队列（幂等）
      await connection.execute(
        "INSERT IGNORE INTO case_details (case_id, fetch_status) VALUES (?, 'pending')",
        [caseId],
      )

      // 品牌与律所不在采集时拆分写入：brands / law_firms 及关联表由其它来源维护。
      // 原始文本保留在 case_ingest_sources.source_brand / source_law_firm。

      const typeSlug = ipTypeSlug(item.ipType)
      const ipTypeId = typeSlug ? ipTypes.get(typeSlug) : undefined
      if (ipTypeId) await connection.execute('INSERT IGNORE INTO case_ip_types (case_id, ip_type_id, created_at) VALUES (?, ?, NOW())', [caseId, ipTypeId])

      await connection.execute(
        `INSERT INTO case_ingest_sources
           (source_key, external_key, case_id, source_url, source_filed_at, source_state, source_law_firm, source_brand, source_ip_type, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           case_id = VALUES(case_id), source_url = VALUES(source_url), source_filed_at = VALUES(source_filed_at),
           source_state = VALUES(source_state), source_law_firm = VALUES(source_law_firm),
           source_brand = VALUES(source_brand), source_ip_type = VALUES(source_ip_type), last_seen_at = NOW(), updated_at = NOW()`,
        [SOURCE_KEY, item.caseNumber, caseId, item.sourceUrl, item.filedAt || null, item.stateCode, item.lawFirm, item.brand, item.ipType],
      )
    }
    await connection.execute(
      `UPDATE brands b SET case_count = (
         SELECT COUNT(*) FROM case_brands cb
         JOIN cases c ON c.id = cb.case_id
         WHERE cb.brand_id = b.id AND c.publish_status = 'published'
       ), updated_at = NOW()`,
      [],
    )
    await connection.execute(
      `UPDATE law_firms lf SET case_count = (
         SELECT COUNT(*) FROM case_law_firms clf
         JOIN cases c ON c.id = clf.case_id
         WHERE clf.law_firm_id = lf.id AND c.publish_status = 'published'
       ), updated_at = NOW()`,
      [],
    )
    return { insertedCount, duplicateCount }
  })
}

/** 每日运行一次；首个成功抓取完整分页后，在事务里替换旧案例/律所/品牌数据。 */
export async function runWorldTroImport(now = new Date()) {
  const scheduledDate = shanghaiDateKey(now)
  const pool = await getTargetPool()
  const lockConnection = await pool.getConnection()
  let hasLock = false
  try {
    const [lockRows] = await lockConnection.execute('SELECT GET_LOCK(?, 0) AS acquired', ['daxin:worldtro:tro:daily'])
    hasLock = Number((lockRows as Array<{ acquired?: number }>)[0]?.acquired ?? 0) === 1
    if (!hasLock) return { skipped: true, reason: 'another-run-is-active' }

    const runs = await queryTarget<RunRow>(
      // 每天两班（00:15 / 12:15）：同一班次内不重复执行，跨班次允许再跑一次
      `SELECT status FROM case_ingest_runs
       WHERE source_key = ? AND scheduled_date = ?
         AND status = 'success' AND finished_at >= (NOW() - INTERVAL 6 HOUR)
       LIMIT 1`,
      [SOURCE_KEY, scheduledDate],
    )
    if (runs[0]?.status === 'success') return { skipped: true, reason: 'already-completed-this-slot' }
    await queryTarget(
      `INSERT INTO case_ingest_runs (source_key, scheduled_date, status, started_at, finished_at, error_message)
       VALUES (?, ?, 'running', NOW(), NULL, '')
       ON DUPLICATE KEY UPDATE status = 'running', started_at = NOW(), finished_at = NULL, error_message = '', updated_at = NOW()`,
      [SOURCE_KEY, scheduledDate],
    )

    try {
      const sourceRows = await queryTarget<CountRow>('SELECT COUNT(*) AS total FROM case_ingest_sources WHERE source_key = ?', [SOURCE_KEY])
      const initialImport = Number(sourceRows[0]?.total ?? 0) === 0
      const knownRows = initialImport
        ? []
        : await queryTarget<{ external_key: string }>('SELECT external_key FROM case_ingest_sources WHERE source_key = ?', [SOURCE_KEY])
      const knownCaseNumbers = new Set(knownRows.map((row) => row.external_key))
      const robots = await getRobotsRules()
      const crawl = await crawlWorldTroList({
        fetchPage: (url) => fetchListingHtml(url, robots),
        initialImport,
        knownCaseNumbers,
        pageDelayMs: Math.max(1500, robots.crawlDelayMs),
      })

      const result = await persistCases(crawl.cases, initialImport)
      await queryTarget(
        `UPDATE case_ingest_runs SET status = 'success', fetched_count = ?, inserted_count = ?, duplicate_count = ?,
           rejected_count = ?, error_message = '', finished_at = NOW(), updated_at = NOW()
         WHERE source_key = ? AND scheduled_date = ?`,
        [crawl.cases.length, result.insertedCount, result.duplicateCount + crawl.duplicateCount, crawl.rejectedCount, SOURCE_KEY, scheduledDate],
      )
      console.info('[worldtro-import] 公开列表采集完成', {
        initialImport,
        pageCount: crawl.pageCount,
        fetchedCount: crawl.cases.length,
        insertedCount: result.insertedCount,
        duplicateCount: result.duplicateCount + crawl.duplicateCount,
      })
      return { initialImport, pageCount: crawl.pageCount, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WorldTRO 采集失败'
      try {
        await queryTarget(
          `UPDATE case_ingest_runs SET status = 'failed', error_message = ?, finished_at = NOW(), updated_at = NOW()
           WHERE source_key = ? AND scheduled_date = ?`,
          [message.slice(0, 1000), SOURCE_KEY, scheduledDate],
        )
      } catch (logError) {
        console.error('[worldtro-import] 无法写入失败日志', logError)
      }
      throw error
    }
  } finally {
    if (hasLock) {
      try { await lockConnection.execute('SELECT RELEASE_LOCK(?)', ['daxin:worldtro:tro:daily']) } catch (error) {
        console.error('[worldtro-import] 释放任务锁失败', error)
      }
    }
    lockConnection.release()
  }
}
