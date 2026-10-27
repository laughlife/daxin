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
const MISSING_HINTS = ['页面不存在', '404', '找不到']
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
    const line = lines[i] ?? ''
    for (const label of labels) {
      if (!line.includes(label)) continue
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
  const events: { date: string; title: string; dedupeKey: string }[] = []
  for (const line of lines) {
    const match = line.match(DATE_RE)
    if (!match) continue
    const year = match[1] ?? ''
    const month = String(match[2] ?? '1').padStart(2, '0')
    const day = String(match[3] ?? '1').padStart(2, '0')
    const date = `${year}-${month}-${day}`
    const title = line.replace(DATE_RE, '').replace(/^[\s\-—:：]+/, '').trim().slice(0, 180)
    if (!title || title.length < 2 || !EVENT_HINTS.test(title)) continue
    events.push({ date, title, dedupeKey: createHash('md5').update(`${date}|${title}`).digest('hex') })
  }

  return {
    courtFull: pickLabel(lines, ['法院', '审理法院']).slice(0, 190),
    defendants: splitList(pickLabel(lines, ['被告', '被告名单'])),
    lawFirms: splitList(pickLabel(lines, ['原告律所', '律所', '代理律所'])),
    brands: splitList(pickLabel(lines, ['原告品牌', '品牌', '涉案品牌'])),
    causeOfAction: pickLabel(lines, ['案由', '侵权类型']).slice(0, 250),
    frozenAmount: pickLabel(lines, ['冻结金额', '冻结']).slice(0, 60),
    claimAmount: pickLabel(lines, ['索赔金额', '和解金额', '索赔']).slice(0, 60),
    events,
    rawText: lines.join('\n').slice(0, 120000),
  }
}

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', referer: 'https://worldtro.com/tro' },
  })
  return { status: res.status, html: await res.text() }
}

function isBlocked(html: string): boolean {
  return CAPTCHA_HINTS.some((hint) => html.includes(hint)) || html.length < 6000
}

function isMissing(html: string): boolean {
  return MISSING_HINTS.some((hint) => html.includes(hint))
}

async function saveDetail(caseId: number, url: string, parsed: ReturnType<typeof parseCaseDetailHtml> | null, status: string, error: string) {
  await queryTarget(
    `INSERT INTO case_details
       (case_id, source_url, court_full, defendants, law_firms, brands, cause_of_action,
        frozen_amount, claim_amount, raw_text, fetch_status, fetch_error, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       source_url = VALUES(source_url), court_full = VALUES(court_full),
       defendants = VALUES(defendants), law_firms = VALUES(law_firms), brands = VALUES(brands),
       cause_of_action = VALUES(cause_of_action), frozen_amount = VALUES(frozen_amount),
       claim_amount = VALUES(claim_amount), raw_text = VALUES(raw_text),
       fetch_status = VALUES(fetch_status), fetch_error = VALUES(fetch_error), fetched_at = NOW()`,
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
  const limit = Math.max(1, Math.min(200, options.limit ?? 20))
  const delayMs = Math.max(1000, options.delayMs ?? 25000)

  const rows = await queryTarget<{ case_id: number; case_number: string; state_code: string; source_url: string; fetch_status: string }>(
    `SELECT d.case_id, c.case_number, IFNULL(NULLIF(c.state_code, ''), '') AS state_code,
            IFNULL(d.source_url, '') AS source_url, d.fetch_status
     FROM case_details d
     JOIN cases c ON c.id = d.case_id
     WHERE d.fetch_status IN ('pending', 'blocked') AND c.case_number <> ''
     ORDER BY c.filed_at DESC, c.id DESC
     LIMIT ?`,
    [limit],
  )
  if (!rows.length) return { picked: 0, ok: 0, partial: 0, blocked: 0, missing: 0, failed: 0, stoppedByCaptcha: false }

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
        result.stoppedByCaptcha = true
        break
      }
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
          `INSERT IGNORE INTO case_events (case_id, event_date, title, dedupe_key)
           VALUES (?, ?, ?, ?)`,
          [caseId, event.date, event.title, event.dedupeKey],
        )
      }
      if (filled) result.ok += 1
      else result.partial += 1
    } catch (error) {
      result.failed += 1
      await saveDetail(caseId, url, null, 'blocked', String(error).slice(0, 200))
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return result
}
