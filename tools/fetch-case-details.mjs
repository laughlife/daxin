// 抓取 worldtro 案件详情页并入库（case_details / case_events）。
//
// 详情页地址：https://worldtro.com/case-{州}-{案件号}.html
// 站点有滑块验证：连续请求会被拦（返回 4KB 左右的「安全验证」页）。
// 默认 8 秒/条；命中验证会标 blocked 并停止本次运行，下次继续。
// 队列：case_details.fetch_status IN ('pending','blocked')，按立案时间倒序。
//
// 用法：
//   node tools/fetch-case-details.mjs --limit 5      # 建议总是带 --limit（不带 = 不限条数）
//   node tools/fetch-case-details.mjs --limit 200 --delay 30000
//   node tools/fetch-case-details.mjs --case 2026-cv-12835   # 只抓指定案件（pending 或已抓过的都行）
//   node tools/fetch-case-details.mjs --refetch --limit 5    # 重新抓已成功的
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const limit = Number(option('limit', 0))
const delayMs = Number(option('delay', 8000))
const onlyCase = option('case', '')
const refetch = args.includes('--refetch')

function sql(statement) {
  return execFileSync(MYSQL, [
    '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
    '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
    '--execute', `USE daxin; ${statement}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const q = (value) => `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const jsonOrNull = (value) => (value ? `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : 'NULL')

/** 极简 HTML → 文本行；保留结构信息（去脚本样式） */
function toLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|div|p|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const CAPTCHA_HINTS = ['安全验证', '向右拖动滑块', '完成验证']
// 正常详情页里也会出现「404」字样（脚本/CSS），因此只认明确的缺失文案
const MISSING_HINTS = ['页面不存在', '该页面不存在', '案件不存在']

function detectBlock(html) {
  // 正常详情页 17~27KB；验证页只有 4.4~4.9KB。
  // 正常页也内嵌了「完成验证」滑块脚本，按关键词判定会误杀，因此只按体积判。
  if (html.length < 6000) return true
  return html.includes('向右拖动滑块完成验证') && !html.includes('案件')
}

function detectMissing(html) {
  return html.length < 12000 && MISSING_HINTS.some((hint) => html.includes(hint))
}

/** 从文本行里按标签抓值：标签后同一行或下一行 */
function pickLabel(lines, labels) {
  for (let i = 0; i < lines.length; i += 1) {
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

const DATE_RE = /(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/

function parseDetail(html, caseNumber) {
  const lines = toLines(html)
  // 案件进展时间线：形如「2026-10-27 立案」或「2026/10/27  TRO 临时禁令」
  const events = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const match = line.match(DATE_RE)
    if (!match) continue
    const date = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
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
    if (/^(日期|案件进程|翻译|订阅|联系)/.test(resolved)) continue
    const timeMatch = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)
    const time = timeMatch?.[1] ? (timeMatch[1].length === 5 ? timeMatch[1] + ':00' : timeMatch[1]) : ''
    const dedupeKey = createHash('md5').update(`${date}|${resolved}`).digest('hex')
    events.push({ date, time, title: resolved, dedupeKey })
  }

  return {
    courtFull: pickLabel(lines, ['法院', '审理法院']),
    defendants: pickLabel(lines, ['被告：', '被告:']),
    lawFirms: pickLabel(lines, ['原告律所：', '代理律所：', '律所：']),
    brands: pickLabel(lines, ['品牌：', '原告品牌：', '涉案品牌：']),
    causeOfAction: pickLabel(lines, ['案由', '侵权类型', '类型']),
    frozenAmount: pickLabel(lines, ['冻结金额', '冻结']),
    claimAmount: pickLabel(lines, ['索赔金额', '和解金额', '索赔']),
    events,
    lines,
  }
}

async function fetchHtml(url) {
  const headers = {
    'user-agent': UA,
    'accept-language': 'zh-CN,zh;q=0.9',
    referer: 'https://worldtro.com/tro',
  }
  // 最多 3 轮：每轮重新取页面拿新 token，再带滑块参数重试
  let lastHtml = ''
  let lastStatus = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers })
    lastStatus = res.status
    lastHtml = await res.text()
    if (res.status !== 200 || !detectBlock(lastHtml)) return { status: res.status, html: lastHtml }

    const token = lastHtml.match(/name="slider_token" id="sl-tok" value="([^"]+)"/)?.[1] ?? ''
    if (!token) return { status: res.status, html: lastHtml }

    const separator = url.includes('?') ? '&' : '?'
    const value = 180 + attempt * 20
    const retryUrl = `${url}${separator}slider_token=${encodeURIComponent(token)}&slider_val=${value}&slider_ms=${1200 + attempt * 200}`
    const retry = await fetch(retryUrl, { headers: { ...headers, referer: url } })
    const retryHtml = await retry.text()
    if (!detectBlock(retryHtml)) return { status: retry.status, html: retryHtml }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return { status: lastStatus, html: lastHtml }
}

function pickTargets() {
  const where = onlyCase
    ? `c.case_number = ${q(onlyCase)}`
    : `d.fetch_status IN ('pending', 'blocked')${refetch ? '' : " AND d.fetch_status <> 'ok'"}`
  return sql(`
    SELECT c.id, c.case_number, IFNULL(NULLIF(c.state_code,''),'') , IFNULL(d.source_url,'')
    FROM cases c LEFT JOIN case_details d ON d.case_id = c.id
    WHERE ${where} AND c.case_number <> ''
    ORDER BY c.filed_at DESC, c.id DESC${limit > 0 ? `
    LIMIT ${limit}` : ''}`)
    .split(/\r?\n/).filter(Boolean).map((line) => line.split('\t').map((cell) => cell.trim()))
}

function saveDetail(caseId, url, parsed, status, error) {
  sql(`
    INSERT INTO case_details (case_id, source_url, court_full, defendants, law_firms, brands,
      cause_of_action, frozen_amount, claim_amount, raw_text, fetch_status, fetch_error, fetched_at)
    VALUES (${caseId}, ${q(url)}, ${q(parsed.courtFull)}, ${jsonOrNull(parsed.defendants)}, ${jsonOrNull(parsed.lawFirms)},
      ${jsonOrNull(parsed.brands)}, ${q(parsed.causeOfAction)}, ${q(parsed.frozenAmount)}, ${q(parsed.claimAmount)},
      ${q(parsed.lines.join('\n').slice(0, 120000))}, ${q(status)}, ${q(error)}, NOW())
    ON DUPLICATE KEY UPDATE source_url=VALUES(source_url), court_full=VALUES(court_full),
      defendants=VALUES(defendants), law_firms=VALUES(law_firms), brands=VALUES(brands),
      cause_of_action=VALUES(cause_of_action), frozen_amount=VALUES(frozen_amount),
      claim_amount=VALUES(claim_amount), raw_text=VALUES(raw_text),
      fetch_status=VALUES(fetch_status), fetch_error=VALUES(fetch_error), fetched_at=NOW()`)
}

const targets = pickTargets()
if (!targets.length) {
  console.log('没有待抓的案件。')
  process.exit(0)
}

console.log(`待抓 ${targets.length} 条，间隔 ${Math.round(delayMs / 1000)}s`)
let consecutiveBlocked = 0
let ok = 0; let blocked = 0; let missing = 0; let failed = 0

for (const [caseId, caseNumber, state, existingUrl] of targets) {
  const url = existingUrl || (state
    ? `https://worldtro.com/case-${state}-${caseNumber}.html`
    : '')
  if (!url) {
    console.log(`  - ${caseNumber}: 缺少州代码，跳过`)
    failed += 1
    continue
  }
  try {
    const { status, html } = await fetchHtml(url)
    if (detectBlock(html)) {
      saveDetail(caseId, url, { courtFull: '', defendants: '', lawFirms: '', brands: '', causeOfAction: '', frozenAmount: '', claimAmount: '', lines: [] }, 'blocked', '触发站点滑块验证')
      blocked += 1
      consecutiveBlocked += 1
      console.log(`  ! ${caseNumber}: 触发验证（连续 ${consecutiveBlocked} 条）`)
      // 偶发一次继续；连续 3 条被拦说明风控了，结束本轮
      if (consecutiveBlocked >= 3) {
        console.log('  ! 连续 3 条被拦，停止本次运行（下一班次重试）')
        break
      }
      continue
    }
    consecutiveBlocked = 0
    if (status === 404 || detectMissing(html)) {
      saveDetail(caseId, url, { courtFull: '', defendants: '', lawFirms: '', brands: '', causeOfAction: '', frozenAmount: '', claimAmount: '', lines: [] }, 'missing', `HTTP ${status}`)
      console.log(`  - ${caseNumber}: 详情页不存在`)
      missing += 1
      continue
    }
    const parsed = parseDetail(html, caseNumber)
    const filled = [parsed.courtFull, parsed.defendants, parsed.lawFirms, parsed.brands].filter(Boolean).length
    saveDetail(caseId, url, parsed, filled ? 'ok' : 'partial', filled ? '' : '未解析到字段')
    for (const event of parsed.events) {
      sql(`INSERT IGNORE INTO case_events (case_id, event_date, event_time, title, dedupe_key)
           VALUES (${caseId}, ${q(event.date)}, ${q(event.time)}, ${q(event.title)}, ${q(event.dedupeKey)})`)
    }
    console.log(`  ✓ ${caseNumber}: 字段 ${filled}/4，进展 ${parsed.events.length} 条`)
    ok += 1
  } catch (error) {
    failed += 1
    saveDetail(caseId, url, { courtFull: '', defendants: '', lawFirms: '', brands: '', causeOfAction: '', frozenAmount: '', claimAmount: '', lines: [] }, 'partial', String(error).slice(0, 200))
    console.log(`  ✗ ${caseNumber}: ${String(error).slice(0, 80)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

console.log(`\n完成：成功 ${ok}，触发验证 ${blocked}，不存在 ${missing}，失败 ${failed}`)
