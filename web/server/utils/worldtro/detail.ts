import { createHash } from 'node:crypto'

import { queryTarget } from '../db/query'

/**
 * 案件详情抓取（worldtro 详情页）。
 *
 * 详情页地址：https://worldtro.com/case-{州}-{案件号}.html
 * 站点有滑块验证：连续请求会被拦。命中验证时把该条标 blocked 并立即结束本次运行，
 * 次日继续；这样既不会丢队列，也不会把 IP 打死。
 *
 * 队列来源：case_details.fetch_status = 'pending' | 'blocked'，
 * 由案件增量入库时写入 pending（新案件），以及 042 迁移为存量案件补的 pending。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const CAPTCHA_HINTS = ['安全验证', '向右拖动滑块', '完成验证']
// 正常详情页里也会出现「404」字样（脚本/CSS），因此只认明确的缺失文案
const MISSING_HINTS = ['页面不存在', '该页面不存在', '案件不存在', '未查询到案件']
const DATE_RE = /(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/
const EVENT_HINTS = /立案|起诉|冻结|禁令|TRO|PI|和解|判决|撤诉|延长|听证|送达|缺席|动议|驳回|开庭|进展/i

export interface CaseDetailSyncResult {
  picked: number
  ok: number
  partial: number
  blocked: number
  missing: number
  failed: number
  stoppedByCaptcha: boolean
}

function toLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|div|p|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function pickLabel(lines: string[], labels: string[]): string {
  for (let i = 0; i < lines.length; i += 1) {
    // 去掉行首的 # / > 等装饰，只认「行首就是标签」的行，避免正文里提到标签被误抓
    const raw = lines[i] ?? ''
    const line = raw.replace(/^[\s#>*-]+/, '')
    for (const label of labels) {
      if (!line.startsWith(label)) continue
      const rest = line.replace(label, '').replace(/[：:]\s*/, '').trim()
      if (rest) return rest
      const next = lines[i + 1]
      if (next && next.length <= 200) return next
    }
  }
  return ''
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)
}

export function parseCaseDetailHtml(html: string) {
  const lines = toLines(html)
  const events: { date: string; time: string; title: string; dedupeKey: string }[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const match = line.match(DATE_RE)
    if (!match) continue
    const year = match[1] ?? ''
    const month = String(match[2] ?? '1').padStart(2, '0')
    const day = String(match[3] ?? '1').padStart(2, '0')
    const date = `${year}-${month}-${day}`
    const title = line.replace(DATE_RE, '')
      .replace(/^[\s\-—:：]+/, '')
      .replace(/^\d{1,2}:\d{2}(:\d{2})?\s*(UTC)?\s*/i, '')
      .replace(/^[\s\-—:：]+/, '')
      .trim()
      .slice(0, 180)
    let resolved = title
    if (!resolved || resolved.length < 2) {
      const nextLine = (lines[i + 1] ?? '').replace(/^[\s#>*-]+/, '').trim()
      resolved = nextLine.slice(0, 180)
    }
    if (!resolved || resolved.length < 2) continue
    // 排除表头/导航文案
    if (/^(日期|案件进程|翻译|订阅|联系)/.test(resolved)) continue
    const timeMatch = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)
    const time = timeMatch?.[1] ? (timeMatch[1].length === 5 ? timeMatch[1] + ':00' : timeMatch[1]) : ''
    events.push({ date, time, title: resolved, dedupeKey: createHash('md5').update(`${date}|${resolved}`).digest('hex') })
  }

  return {
    courtFull: pickLabel(lines, ['法院', '审理法院']).slice(0, 190),
    defendants: splitList(pickLabel(lines, ['被告：', '被告:'])),
    lawFirms: splitList(pickLabel(lines, ['原告律所：', '代理律所：', '律所：'])),
    brands: splitList(pickLabel(lines, ['品牌：', '原告品牌：', '涉案品牌：'])),
    causeOfAction: pickLabel(lines, ['案由', '侵权类型']).slice(0, 250),
    frozenAmount: pickLabel(lines, ['冻结金额', '冻结']).slice(0, 60),
    claimAmount: pickLabel(lines, ['索赔金额', '和解金额', '索赔']).slice(0, 60),
    events,
    rawText: lines.join('\n').slice(0, 120000),
  }
}

const PAGE_HEADERS = {
  'user-agent': UA,
  'accept-language': 'zh-CN,zh;q=0.9',
  referer: 'https://worldtro.com/tro',
}

/**
 * 抓详情页；命中滑块时用页面下发的 slider_token 直接带参重试。
 *
 * 实测站点只校验 slider_val（拖动距离）与 slider_ms（耗时），没有轨迹/加速度校验，
 * 因此用固定的 180 / 1200ms 即可通过，无需真实拖动。
 */
async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  // 最多 3 轮：每轮重新取页面拿新 token，再带滑块参数重试
  let lastStatus = 0
  let lastHtml = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: PAGE_HEADERS })
    lastStatus = res.status
    lastHtml = await res.text()
    if (res.status !== 200 || !isBlocked(lastHtml)) return { status: res.status, html: lastHtml }

    const token = lastHtml.match(/name="slider_token" id="sl-tok" value="([^"]+)"/)?.[1] ?? ''
    if (!token) return { status: res.status, html: lastHtml }

    const separator = url.includes('?') ? '&' : '?'
    const value = 180 + attempt * 20
    const retryUrl = `${url}${separator}slider_token=${encodeURIComponent(token)}&slider_val=${value}&slider_ms=${1200 + attempt * 200}`
    const retry = await fetch(retryUrl, { headers: { ...PAGE_HEADERS, referer: url } })
    const retryHtml = await retry.text()
    if (!isBlocked(retryHtml)) return { status: retry.status, html: retryHtml }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return { status: lastStatus, html: lastHtml }
}

/** 「未查询到案件号：xxx 的案件信息」是源站明确的无此案件页，不是滑块拦截。 */
function isUnavailableCase(html: string): boolean {
  return html.includes('未查询到案件')
}

function isBlocked(html: string): boolean {
  // 无此案件的提示页往往很小，先排除，否则会被误判成滑块验证页并触发「连续 3 条停止」
  if (isUnavailableCase(html)) return false
  // 正常详情页 17~27KB；验证页只有 4.4~4.9KB。
  // 注意：正常页里也内嵌了「完成验证」的滑块脚本，不能按关键词判定，否则会误杀。
  if (html.length < 6000) return true
  return html.includes('向右拖动滑块完成验证') && !html.includes('案件')
}

function isMissing(html: string): boolean {
  // 无此案件的提示页无论长短都算缺失；正常详情页很长且可能含「404」字样，只有短页面才按文案判
  if (isUnavailableCase(html)) return true
  return html.length < 12000 && MISSING_HINTS.some((hint) => html.includes(hint))
}

async function saveDetail(caseId: number, url: string, parsed: ReturnType<typeof parseCaseDetailHtml> | null, status: string, error: string) {
  await queryTarget(
    `INSERT INTO case_details
       (case_id, source_url, court_full, defendants, law_firms, brands, cause_of_action,
        frozen_amount, claim_amount, raw_text, fetch_status, fetch_error, fetched_at, fetch_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
     ON DUPLICATE KEY UPDATE
       source_url = VALUES(source_url), court_full = VALUES(court_full),
       defendants = VALUES(defendants), law_firms = VALUES(law_firms), brands = VALUES(brands),
       cause_of_action = VALUES(cause_of_action), frozen_amount = VALUES(frozen_amount),
       claim_amount = VALUES(claim_amount), raw_text = VALUES(raw_text),
       fetch_status = VALUES(fetch_status), fetch_error = VALUES(fetch_error), fetched_at = NOW(),
       fetch_attempts = fetch_attempts + 1`,
    [
      caseId,
      url,
      parsed?.courtFull ?? '',
      parsed ? JSON.stringify(parsed.defendants) : null,
      parsed ? JSON.stringify(parsed.lawFirms) : null,
      parsed ? JSON.stringify(parsed.brands) : null,
      parsed?.causeOfAction ?? '',
      parsed?.frozenAmount ?? '',
      parsed?.claimAmount ?? '',
      parsed?.rawText ?? '',
      status,
      error.slice(0, 250),
    ],
  )
}

/** 抓一批待处理案件的详情；命中滑块即停止。 */
export async function runCaseDetailSync(options: {
  limit?: number
  delayMs?: number
} = {}): Promise<CaseDetailSyncResult> {
  // limit <= 0 表示不限条数：补跑时一次跑完所有 pending
  const rawLimit = options.limit ?? 0
  const limit = rawLimit > 0 ? Math.min(rawLimit, 5000) : 0
  const delayMs = Math.max(1000, options.delayMs ?? 8000)

  /*
   * 复查：立案 N 天内的案件，进展仍在持续更新（立案 → TRO → PI → 和解）。
   * N 由 WORLDTRO_RECHECK_DAYS 配置，默认 30 天。
   * 已抓成功且距上次抓取超过 12 小时的，重新置为 pending 再抓一次；
   * case_events 有 (case_id, dedupe_key) 唯一键，重复抓取只会追加新进展。
   */
  // 复查窗口天数：WORLDTRO_RECHECK_DAYS，默认 30 天，夹取 1~365
  const recheckDays = Math.max(1, Math.min(365, Number(process.env.WORLDTRO_RECHECK_DAYS ?? 30) || 30))
  const recheckConditions = `
       d.fetch_status = 'ok'
       AND c.filed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       AND (d.fetched_at IS NULL OR d.fetched_at < (NOW() - INTERVAL 11 HOUR))`

  const recheckCandidates = await queryTarget<{ total: number | string }>(
    `SELECT COUNT(*) AS total
     FROM case_details d
     JOIN cases c ON c.id = d.case_id
     WHERE ${recheckConditions}`,
    [recheckDays],
  )
  const recheckCount = Number(recheckCandidates[0]?.total ?? 0)
  if (recheckCount > 0) {
    await queryTarget(
      `UPDATE case_details d
       JOIN cases c ON c.id = d.case_id
       SET d.fetch_status = 'pending'
       WHERE ${recheckConditions}`,
      [recheckDays],
    )
    console.info('[worldtro-detail] 活跃案件复查：' + recheckCount + ' 条重新入队（立案 ' + recheckDays + ' 天内）')
  }

  const rows = await queryTarget<{ case_id: number; case_number: string; state_code: string; source_url: string; fetch_status: string }>(
    `SELECT d.case_id, c.case_number, IFNULL(NULLIF(c.state_code, ''), '') AS state_code,
            IFNULL(d.source_url, '') AS source_url, d.fetch_status
     FROM case_details d
     JOIN cases c ON c.id = d.case_id
     WHERE c.case_number <> ''
       AND (
         d.fetch_status IN ('pending', 'blocked')
         -- 页面暂时不存在（源站延迟发布等）：7 天后重试，最多 2 次
         OR (d.fetch_status = 'missing' AND d.fetch_attempts < 2
             AND (d.fetched_at IS NULL OR d.fetched_at < (NOW() - INTERVAL 7 DAY)))
         -- 抓到了但没解析到字段：1 天后重试，最多 5 次
         OR (d.fetch_status = 'partial' AND d.fetch_attempts < 5
             AND (d.fetched_at IS NULL OR d.fetched_at < (NOW() - INTERVAL 1 DAY)))
       )
     ORDER BY c.filed_at DESC, c.id DESC
     ${limit > 0 ? 'LIMIT ?' : ''}`,
    limit > 0 ? [limit] : [],
  )
  if (!rows.length) return { picked: 0, ok: 0, partial: 0, blocked: 0, missing: 0, failed: 0, stoppedByCaptcha: false }

  let processed = 0
  let consecutiveBlocked = 0
  const result: CaseDetailSyncResult = { picked: rows.length, ok: 0, partial: 0, blocked: 0, missing: 0, failed: 0, stoppedByCaptcha: false }

  for (const row of rows) {
    const caseId = Number(row.case_id)
    const url = row.source_url || (row.state_code ? `https://worldtro.com/case-${row.state_code}-${row.case_number}.html` : '')
    if (!url) {
      result.failed += 1
      continue
    }
    try {
      const { status, html } = await fetchPage(url)
      if (isBlocked(html)) {
        await saveDetail(caseId, url, null, 'blocked', '触发站点滑块验证')
        result.blocked += 1
        consecutiveBlocked += 1
        // 偶发一次继续跑；连续 3 条都被拦说明已被风控，结束本轮等下一班次
        if (consecutiveBlocked >= 3) {
          result.stoppedByCaptcha = true
          break
        }
        continue
      }
      consecutiveBlocked = 0
      if (status === 404 || isMissing(html)) {
        await saveDetail(caseId, url, null, 'missing', `HTTP ${status}`)
        result.missing += 1
        continue
      }
      const parsed = parseCaseDetailHtml(html)
      const filled = [parsed.courtFull, parsed.defendants.length, parsed.lawFirms.length, parsed.brands.length].filter(Boolean).length
      await saveDetail(caseId, url, parsed, filled ? 'ok' : 'partial', filled ? '' : '未解析到字段')
      for (const event of parsed.events) {
        await queryTarget(
          `INSERT IGNORE INTO case_events (case_id, event_date, event_time, title, dedupe_key)
           VALUES (?, ?, ?, ?, ?)`,
          [caseId, event.date, event.time, event.title, event.dedupeKey],
        )
      }
      if (filled) result.ok += 1
      else result.partial += 1
    } catch (error) {
      result.failed += 1
      await saveDetail(caseId, url, null, 'blocked', String(error).slice(0, 200))
    }
    processed += 1
    // 每 100 条长歇 60 秒，降低被风控的概率
    if (processed % 100 === 0) {
      console.info('[worldtro-detail] 已处理 ' + processed + ' 条，休息 60 秒')
      await new Promise((resolve) => setTimeout(resolve, 60_000))
      continue
    }
    // 8 秒基准 + 0.75~1.5 倍随机抖动（6~12 秒）
    const jittered = Math.round(delayMs * (0.75 + Math.random() * 0.75))
    await new Promise((resolve) => setTimeout(resolve, jittered))
  }

  return result
}
