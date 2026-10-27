// 抓取 worldtro 案件详情页并入库（case_details / case_events）。
//
// 详情页地址：https://worldtro.com/case-{州}-{案件号}.html
// 站点有滑块验证：连续请求会被拦（返回 4KB 左右的「安全验证」页）。
// 因此默认按 25 秒间隔慢慢抓，命中验证立刻停止本次运行，把该条标 blocked，次日再试。
//
// 用法：
//   node tools/fetch-case-details.mjs                 # 抓 5 条
//   node tools/fetch-case-details.mjs --limit 20
//   node tools/fetch-case-details.mjs --delay 30000
//   node tools/fetch-case-details.mjs --case 2026-cv-12835   # 只抓指定案件
//   node tools/fetch-case-details.mjs --refetch              # 重新抓已成功的
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const limit = Number(option('limit', 5))
const delayMs = Number(option('delay', 25000))
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
const MISSING_HINTS = ['页面不存在', '404', '找不到']

function detectBlock(html) {
  return CAPTCHA_HINTS.some((hint) => html.includes(hint)) || html.length < 6000
}

function detectMissing(html) {
  return MISSING_HINTS.some((hint) => html.includes(hint))
}

/** 从文本行里按标签抓值：标签后同一行或下一行 */
function pickLabel(lines, labels) {
  for (let i = 0; i < lines.length; i += 1) {
    for (const label of labels) {
      if (!lines[i].includes(label)) continue
      const rest = lines[i].replace(label, '').replace(/[：:]\s*/, '').trim()
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
  for (const line of lines) {
    const match = line.match(DATE_RE)
    if (!match) continue
    const date = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    const title = line.replace(DATE_RE, '').replace(/^[\s\-—:：]+/, '').trim().slice(0, 180)
    if (!title || title.length < 2) continue
    if (!/立案|起诉|冻结|禁令|TRO|PI|和解|判决|撤诉|延长|听证|送达|缺席|动议|驳回|开庭|进展/i.test(title)) continue
    const dedupeKey = createHash('md5').update(`${date}|${title}`).digest('hex')
    events.push({ date, title, dedupeKey })
  }

  return {
    courtFull: pickLabel(lines, ['法院', '审理法院']),
    defendants: pickLabel(lines, ['被告', '被告名单']),
    lawFirms: pickLabel(lines, ['原告律所', '律所', '代理律所']),
    brands: pickLabel(lines, ['原告品牌', '品牌', '涉案品牌']),
    causeOfAction: pickLabel(lines, ['案由', '侵权类型', '类型']),
    frozenAmount: pickLabel(lines, ['冻结金额', '冻结']),
    claimAmount: pickLabel(lines, ['索赔金额', '和解金额', '索赔']),
    events,
    lines,
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'zh-CN,zh;q=0.9',
      referer: 'https://worldtro.com/tro',
    },
  })
  return { status: res.status, html: await res.text() }
}

function pickTargets() {
  const where = onlyCase
    ? `c.case_number = ${q(onlyCase)}`
    : `d.fetch_status IN ('pending', 'blocked')${refetch ? '' : " AND d.fetch_status <> 'ok'"}`
  return sql(`
    SELECT c.id, c.case_number, IFNULL(NULLIF(c.state_code,''),'') , IFNULL(d.source_url,'')
    FROM cases c LEFT JOIN case_details d ON d.case_id = c.id
    WHERE ${where} AND c.case_number <> ''
    ORDER BY c.filed_at DESC, c.id DESC
    LIMIT ${limit}`)
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
      console.log(`  ! ${caseNumber}: 触发验证，停止本次运行（次日重试）`)
      blocked += 1
      break
    }
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
      sql(`INSERT IGNORE INTO case_events (case_id, event_date, title, dedupe_key)
           VALUES (${caseId}, ${q(event.date)}, ${q(event.title)}, ${q(event.dedupeKey)})`)
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
