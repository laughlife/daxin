const SOURCE_ORIGIN = 'https://worldtro.com'

/** @typedef {{ caseNumber: string, filedAt: string, plaintiff: string, stateCode: string, lawFirm: string, brand: string, ipType: string, sourceUrl: string }} WorldTroCase */

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function cellText(html) {
  return decodeHtml(String(html ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\u200b\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCells(rowHtml) {
  return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)].map((match) => match[1])
}

function findHeaderIndex(headers, predicates) {
  return headers.findIndex((header) => predicates.some((predicate) => predicate.test(header)))
}

function parseDate(value) {
  const input = String(value ?? '').trim()
  let parts = input.match(/\b(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/)
  if (parts) return validDate(parts[1], parts[2], parts[3])
  parts = input.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (parts) return validDate(parts[3], parts[1], parts[2])
  return ''
}

function validDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return ''
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function absoluteSourceUrl(cellHtml, pageUrl) {
  const href = cellHtml.match(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]
  if (!href) return ''
  try {
    const url = new URL(decodeHtml(href), pageUrl)
    if (url.protocol !== 'https:' || !['worldtro.com', 'www.worldtro.com'].includes(url.hostname)) return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function paginationBase(pathname) {
  return pathname
    .replace(/\/page\/\d+\/?$/i, '/')
    .replace(/\/(\d+)\/?$/, '/')
    .replace(/\/$/, '')
}

function findNextListingPage(html, pageUrl) {
  const current = new URL(pageUrl)
  const candidates = []
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = match[1]
    const href = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (!href) continue
    let next
    try { next = new URL(decodeHtml(href), pageUrl) } catch { continue }
    if (next.protocol !== 'https:' || next.hostname !== current.hostname || paginationBase(next.pathname) !== paginationBase(current.pathname)) continue
    next.hash = ''
    if (next.toString() === current.toString()) continue

    const text = cellText(match[2])
    const rel = attrs.match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2] ?? ''
    const className = attrs.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2] ?? ''
    const ariaLabel = attrs.match(/\baria-label\s*=\s*(["'])(.*?)\1/i)?.[2] ?? ''
    const pageParam = [...next.searchParams.entries()].find(([key]) => /^(?:page|paged|p|currentpage)$/i.test(key))
    const pathPage = next.pathname.match(/\/(?:page\/)?(\d+)\/?$/i)
    const pageNumber = Number(pageParam?.[1] ?? pathPage?.[1] ?? '')
    const currentParam = [...current.searchParams.entries()].find(([key]) => /^(?:page|paged|p|currentpage)$/i.test(key))
    const currentPathPage = current.pathname.match(/\/(?:page\/)?(\d+)\/?$/i)
    const currentPageNumber = Number(currentParam?.[1] ?? currentPathPage?.[1] ?? '1')
    const isNext = /\bnext\b|下一页|下页|后页|›|»/i.test(`${text} ${rel} ${className} ${ariaLabel}`)
    const isNumberedPage = Number.isInteger(pageNumber) && pageNumber > currentPageNumber
      && (/^\d+$/.test(text) || /(?:page|pagination|pagenav)/i.test(className))
    if (isNext) candidates.unshift(next.toString())
    else if (isNumberedPage) candidates.push({ url: next.toString(), pageNumber })
  }
  return candidates[0] ?? candidates.sort((a, b) => a.pageNumber - b.pageNumber)[0]?.url ?? ''
}

/**
 * 只解析明确包含七个已知表头的公开案件表。结构变化或反爬页面会报错，调用方应终止本次导入。
 * @param {string} html
 * @param {string} [pageUrl]
 * @returns {{ cases: WorldTroCase[], rejectedCount: number, nextPageUrl: string }}
 */
export function parseWorldTroCasePage(html, pageUrl = `${SOURCE_ORIGIN}/tro`) {
  if (typeof html !== 'string' || html.length < 100 || html.length > 8 * 1024 * 1024) {
    throw new Error('WorldTRO 页面为空或超出允许的读取大小')
  }

  const tableMatches = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)]
  for (const tableMatch of tableMatches) {
    const rowMatches = [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
    if (rowMatches.length < 2) continue
    const headers = extractCells(rowMatches[0][1]).map(cellText)
    const indexes = {
      date: findHeaderIndex(headers, [/日期/, /起诉时间/, /^date$/i]),
      caseNumber: findHeaderIndex(headers, [/案件号/, /案件编号/, /^case\s*(?:number|no\.?)/i]),
      plaintiff: findHeaderIndex(headers, [/原告/, /plaintiff/i]),
      state: findHeaderIndex(headers, [/州/, /地区/, /state/i]),
      lawFirm: findHeaderIndex(headers, [/原告律所/, /代理律所/, /律所/, /law\s*firm/i]),
      brand: findHeaderIndex(headers, [/原告品牌/, /品牌/, /brand/i]),
      ipType: findHeaderIndex(headers, [/类型/, /侵权类型/, /type/i]),
    }
    if (Object.values(indexes).some((index) => index < 0)) continue

    /** @type {WorldTroCase[]} */
    const cases = []
    let rejectedCount = 0
    for (const rowMatch of rowMatches.slice(1)) {
      const rawCells = extractCells(rowMatch[1])
      if (rawCells.length <= Math.max(...Object.values(indexes))) {
        rejectedCount += 1
        continue
      }
      const values = rawCells.map(cellText)
      const caseNumberMatch = values[indexes.caseNumber].match(/\b(\d{2,4}\s*-\s*[a-z]{2}\s*-\s*\d{1,8})\b/i)
      const caseNumber = caseNumberMatch?.[1].replace(/\s+/g, '') ?? ''
      const filedAt = parseDate(values[indexes.date])
      const plaintiff = values[indexes.plaintiff]
      if (!caseNumber || !filedAt || !plaintiff) {
        rejectedCount += 1
        continue
      }

      const stateCode = values[indexes.state].toUpperCase()
      const lawFirm = values[indexes.lawFirm]
      const brand = values[indexes.brand]
      const ipType = values[indexes.ipType]
      if (plaintiff.length > 255 || lawFirm.length > 191 || brand.length > 191 || ipType.length > 32 || stateCode.length > 8) {
        rejectedCount += 1
        continue
      }

      cases.push({
        caseNumber,
        filedAt,
        plaintiff,
        stateCode,
        lawFirm,
        brand,
        ipType,
        sourceUrl: absoluteSourceUrl(rawCells[indexes.caseNumber], pageUrl),
      })
    }
    return { cases, rejectedCount, nextPageUrl: findNextListingPage(html, pageUrl) }
  }
  throw new Error('未找到符合预期字段的案件表；为避免把错误页面写入数据库，本次采集已停止')
}

/** @param {string} html @param {string} [pageUrl] @returns {WorldTroCase[]} */
export function parseWorldTroCases(html, pageUrl = `${SOURCE_ORIGIN}/tro`) {
  return parseWorldTroCasePage(html, pageUrl).cases
}

function ruleToRegex(path) {
  const anchored = path.endsWith('$')
  const pattern = anchored ? path.slice(0, -1) : path
  const source = pattern.split('*').map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')).join('.*')
  return new RegExp(`^${source}${anchored ? '$' : ''}`)
}

/**
 * Parse robots.txt for the configured crawler user-agent. Unsupported or absent rules stay conservative.
 * @param {string} robotsText
 * @param {string} userAgent
 * @returns {{ allowed: (url: string) => boolean, crawlDelayMs: number }}
 */
export function parseRobotsRules(robotsText, userAgent = 'DaxinCaseImporter') {
  const groups = []
  let group = null
  for (const rawLine of String(robotsText ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'user-agent') {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], crawlDelayMs: 0, hasRules: false }
        groups.push(group)
      }
      group.agents.push(value.toLowerCase())
    } else if (group && (key === 'allow' || key === 'disallow')) {
      group.hasRules = true
      if (value) group.rules.push({ path: value, allow: key === 'allow' })
    } else if (group && key === 'crawl-delay' && /^\d+(?:\.\d+)?$/.test(value)) {
      group.crawlDelayMs = Math.min(Number(value) * 1000, 30000)
    }
  }

  const ua = userAgent.toLowerCase()
  const matching = groups.map((item) => ({
    ...item,
    specificity: Math.max(0, ...item.agents.filter((agent) => agent !== '*' && ua.includes(agent)).map((agent) => agent.length)),
  })).filter((item) => item.specificity > 0)
  const chosen = matching.length
    ? matching.filter((item) => item.specificity === Math.max(...matching.map((candidate) => candidate.specificity)))
    : groups.filter((item) => item.agents.includes('*'))
  const rules = chosen.flatMap((item) => item.rules.map((rule) => ({ ...rule, regex: ruleToRegex(rule.path) })))
  const crawlDelayMs = Math.max(0, ...chosen.map((item) => item.crawlDelayMs))

  return {
    crawlDelayMs,
    allowed(urlValue) {
      let url
      try { url = new URL(urlValue) } catch { return false }
      const target = `${url.pathname}${url.search}`
      const matches = rules.filter((rule) => rule.regex.test(target))
      if (!matches.length) return true
      matches.sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow))
      return matches[0].allow
    },
  }
}
