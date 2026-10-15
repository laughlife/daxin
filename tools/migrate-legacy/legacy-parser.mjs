// 旧库文章解析：纯函数，不连接数据库，便于测试和 dry-run 复用。
//
// 处理链路：
//   1. 清洗正文 HTML（白名单标签与属性、去脚本/事件属性/危险链接）；
//   2. 转纯文本并按字段标签提取案件号、立案时间、原告、代理律所；
//   3. 抽取正文图片引用，供后续与 OSS 资源关联；
//   4. 生成稳定 slug 与人工核验原因。

/** 案件号：两位年份 + cv/cc 等类型段 + 序号，允许全角与空格分隔。 */
export const CASE_NUMBER_PATTERN = /[0-9０-９]{2}\s*[-–—_]\s*(?:cv|cc|mc|cr|ca|md)\s*[-–—_]\s*[0-9０-９]{1,6}/gi

/** 字段标签：同一行内冒号后的内容即字段值。 */
const FIELD_LABELS = {
  caseNumber: ['案件号', '案件编号', '案号'],
  filedAt: ['立案时间', '立案日期', '起诉时间', '起诉日期'],
  plaintiff: ['原告人', '原告'],
  lawFirmName: ['代理律所', '原告律所', '代理律所名称'],
  court: ['受理法院', '法院'],
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'section', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'figure', 'figcaption',
  'img', 'a', 'hr', 'pre', 'code',
])

const VOID_TAGS = new Set(['br', 'img', 'hr'])

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'figure', 'figcaption', 'hr', 'pre', 'table', 'thead', 'tbody',
])

/** 去掉用户留言模块的开始标记。 */
const UGC_MARKERS = [/在线留言/, /姓名\s*[:：]/, /电话\s*[:：]/]

const PHONE_PATTERN = /\b1[3-9]\d{9}\b/


/** 把全角数字、字母、横线与空格归一化为半角。 */
export function toHalfWidth(text) {
  return String(text ?? '')
    .replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/[\u3000]/g, ' ')
    .replace(/[\u2010-\u2015\uFE58\uFE63\uFF0D]/g, '-')
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
  yuan: '¥',
  deg: '°',
}

/** 单次解码 HTML 实体；不递归，避免 &amp;amp; 被展开两次。 */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    return named ?? match
  })
}

function safeFromCodePoint(code, fallback) {
  if (code < 0 || code > 0x10FFFF) return fallback
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/** 把 HTML 转成便于按标签提取字段的纯文本，块级标签转换为换行。 */
export function htmlToPlainText(html) {
  const withoutNonContent = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  const withBreaks = withoutNonContent.replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g, (match, slash, rawTag) => {
    const tag = rawTag.toLowerCase()
    if (!BLOCK_TAGS.has(tag)) return ''
    return '\n'
  })
  return normalizeWhitespace(decodeEntities(withBreaks))
}

function normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** 白名单清洗 HTML：保留正文结构，去掉脚本、事件属性、style 与危险链接。 */
export function sanitizeHtml(html) {
  const source = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe|object|embed|form|input|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|noscript|iframe|object|embed|form|input|button|link|meta)\b[^>]*\/?>/gi, '')

  const output = []
  const tagStack = []
  const tokenPattern = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/g
  let lastIndex = 0
  let match

  while ((match = tokenPattern.exec(source)) !== null) {
    output.push(escapeText(source.slice(lastIndex, match.index)))
    lastIndex = tokenPattern.lastIndex

    const [, closing, rawTag, rawAttributes, selfClosing] = match
    const tag = rawTag.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) continue
    if (closing) {
      const stackIndex = tagStack.lastIndexOf(tag)
      if (stackIndex !== -1) {
        for (let index = tagStack.length - 1; index >= stackIndex; index -= 1) {
          output.push(`</${tagStack[index]}>`)
        }
        tagStack.length = stackIndex
      }
      continue
    }

    const attributes = sanitizeAttributes(tag, rawAttributes)
    output.push(`<${tag}${attributes}>`)
    if (!VOID_TAGS.has(tag) && !selfClosing) tagStack.push(tag)
  }
  output.push(escapeText(source.slice(lastIndex)))

  while (tagStack.length > 0) output.push(`</${tagStack.pop()}>`)
  return output.join('').replace(/\s{2,}/g, ' ').trim()
}

function sanitizeAttributes(tag, rawAttributes) {
  const parsed = parseAttributes(rawAttributes)
  const kept = []
  if (tag === 'a') {
    const href = pickSafeUrl(parsed.href)
    if (href) {
      kept.push(`href="${escapeAttribute(href)}"`)
      kept.push(`rel="noopener noreferrer"`)
    }
  }
  if (tag === 'img') {
    const src = pickSafeUrl(parsed.src)
    if (!src) return ''
    kept.push(`src="${escapeAttribute(src)}"`)
    const alt = parsed.alt || parsed.title || ''
    if (alt) kept.push(`alt="${escapeAttribute(alt)}"`)
  }
  return kept.length > 0 ? ` ${kept.join(' ')}` : ''
}

function parseAttributes(rawAttributes) {
  const attributes = {}
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match
  while ((match = pattern.exec(rawAttributes ?? '')) !== null) {
    const name = match[1].toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attributes[name] = decodeEntities(value).trim()
  }
  return attributes
}

/**
 * 判断是否为可保留的资源地址。
 * 拒绝 javascript、vbscript、file 与 data:（内联 base64 图片不是正式 OSS 资源）。
 */
export function pickSafeUrl(url) {
  const value = String(url ?? '').trim()
  if (!value) return ''
  if (/^(?:javascript|vbscript|file|data)\s*:/i.test(value)) return ''
  if (/^https?:|^\/\//i.test(value)) return value.startsWith('//') ? `https:${value}` : value
  if (/^\/|^res\/|^uploads?\/|^https?:\/\//i.test(value)) return value
  return ''
}

function escapeText(text) {
  return String(text ?? '').replace(/&(?![A-Za-z#][A-Za-z0-9]*;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 案件号归一化：半角化、统一小写、序号补零到四位（超过四位保持不变）。 */
export function normalizeCaseNumber(input) {
  const text = toHalfWidth(input)
  const match = /([0-9]{2})\s*-\s*([a-z]{2})\s*-\s*([0-9]{1,6})/i.exec(text)
  if (!match) return ''
  const [, year, type, rawSequence] = match
  const sequence = rawSequence.length > 4 ? rawSequence : rawSequence.padStart(4, '0')
  return `${year}-${type.toLowerCase()}-${sequence}`
}

/** 解析日期文本，支持 -、/、.、年月日 分隔；非法日期返回 null。 */
export function parseDateText(input) {
  const text = toHalfWidth(input)
  const match = /([0-9]{4})\s*[-/.年]\s*([0-9]{1,2})\s*[-/.月]\s*([0-9]{1,2})/.exec(text)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (year < 1990 || year > 2100) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 从纯文本中按字段标签提取值；标签必须出现在行首或紧跟换行。 */
function extractLabeledFields(plainText) {
  const fields = {}
  for (const [field, labels] of Object.entries(FIELD_LABELS)) {
    for (const label of labels) {
      const pattern = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]\\s*([^\\n]{1,200})`)
      const match = pattern.exec(plainText)
      if (match) {
        const value = cleanFieldValue(match[1])
        if (value) {
          fields[field] = value
          break
        }
      }
    }
  }
  return fields
}

function cleanFieldValue(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[，,、;；]+\s*$/, '')
    .trim()
}

/** 找出文本中按出现顺序排列的全部案件号（去重）。 */
export function findCaseNumbers(text) {
  const source = toHalfWidth(text)
  const found = []
  const seen = new Set()
  CASE_NUMBER_PATTERN.lastIndex = 0
  let match
  while ((match = CASE_NUMBER_PATTERN.exec(source)) !== null) {
    const normalized = normalizeCaseNumber(match[0])
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    found.push(normalized)
  }
  return found
}

/**
 * 提取带标签的案件号值（案件号 / 案件编号 / 案号）。
 * 旧站正文里同一行可能罗列多个案件号，这里全部取出。
 */
export function findLabeledCaseNumbers(plainText) {
  const numbers = []
  const seen = new Set()
  for (const label of FIELD_LABELS.caseNumber) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]\\s*([^\\n]{1,300})`, 'g')
    let match
    while ((match = pattern.exec(plainText)) !== null) {
      for (const number of findCaseNumbers(match[1])) {
        if (seen.has(number)) continue
        seen.add(number)
        numbers.push(number)
      }
    }
  }
  return numbers
}

/**
 * 从标题与正文提取案件候选。
 *
 * 优先级：
 *   1. 正文里带“案件号/案件编号/案号”标签的值 —— 这是旧站的权威字段；
 *   2. 标题中的案件号 —— 标题通常直接写明本案案件号；
 *   3. 以上都没有时，才扫描正文中出现的案件号作为兜底，避免把
 *      “历史案件参考”“其他案件提及”误当成本文案件而虚增案件数。
 */
export function extractCaseCandidates(title, content) {
  const plainText = htmlToPlainText(content)
  const fields = extractLabeledFields(plainText)
  const labeled = findLabeledCaseNumbers(plainText)
  const fromTitle = findCaseNumbers(title)

  let numbers
  if (labeled.length > 0) {
    numbers = [...new Set([...labeled, ...fromTitle])]
  } else if (fromTitle.length > 0) {
    numbers = fromTitle
  } else {
    numbers = findCaseNumbers(plainText)
  }
  if (numbers.length === 0) return []

  return numbers.map((caseNumber) => {
    const missingFields = []
    if (!fields.filedAt) missingFields.push('filedAt')
    if (!fields.plaintiff) missingFields.push('plaintiff')
    if (!fields.lawFirmName) missingFields.push('lawFirmName')
    const total = 4
    const confidence = Number(((total - missingFields.length) / total).toFixed(4))
    const filedAt = fields.filedAt ? parseDateText(fields.filedAt) : null
    if (fields.filedAt && !filedAt) missingFields.push('filedAt')
    return {
      caseNumber,
      filedAt,
      plaintiff: fields.plaintiff ?? '',
      lawFirmName: fields.lawFirmName ?? '',
      court: fields.court ?? '',
      sourceTitle: String(title ?? '').trim(),
      extractionRule: labeled.includes(caseNumber) ? 'label' : (fromTitle.includes(caseNumber) ? 'title' : 'content-fallback'),
      confidence,
      missingFields: missingFields.filter((field, index, list) => list.indexOf(field) === index),
    }
  })
}

/** 抽取正文图片引用：去重、保留顺序、标记外链。 */
export function extractMediaReferences(html) {
  const references = []
  const seen = new Set()
  const pattern = /<img\b([^>]*)>/gi
  let match
  while ((match = pattern.exec(String(html ?? ''))) !== null) {
    const attributes = parseAttributes(match[1])
    const sourcePath = pickSafeUrl(attributes.src)
    if (!sourcePath || seen.has(sourcePath)) continue
    seen.add(sourcePath)
    references.push({
      sourcePath,
      altText: (attributes.alt || attributes.title || '').slice(0, 255),
      position: references.length,
      isExternal: /^https?:/i.test(sourcePath),
    })
  }
  return references
}

/** 去掉旧站用户留言等非正文模块。 */
export function stripLegacyUgc(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const kept = []
  for (const line of lines) {
    if (UGC_MARKERS.some((marker) => marker.test(line))) break
    if (PHONE_PATTERN.test(line)) continue
    kept.push(line)
  }
  return normalizeWhitespace(kept.join('\n'))
}

/** 生成 URL 安全标识；纯 ASCII 标题保持可读，中文标题转成稳定前缀加十六进制。 */
export function slugify(input) {
  const text = String(input ?? '').trim()
  const asciiOnly = text
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (asciiOnly) return asciiOnly.slice(0, 180)

  const mixed = text
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!mixed) return `legacy-${shortHash(text)}`
  const encoded = mixed.replace(/[\u4e00-\u9fa5]+/g, (chunk) => shortHash(chunk))
  return `${encoded}-${shortHash(text)}`.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 180)
}

/** 生成文章 slug，若已占用则追加来源信息保证唯一。 */
export function buildArticleSlug(title, sourceTable, sourceId, usedSlugs = new Set()) {
  const base = slugify(title) || `legacy-${shortHash(`${sourceTable}:${sourceId}`)}`
  let candidate = base
  let attempt = 1
  while (usedSlugs.has(candidate)) {
    candidate = `${base}-${sourceTable}${sourceId}`.replace(/-+/g, '-').slice(0, 180)
    if (!usedSlugs.has(candidate)) break
    candidate = `${base}-${sourceTable}${sourceId}-${attempt}`
    attempt += 1
  }
  usedSlugs.add(candidate)
  return candidate
}

function shortHash(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Unix 时间戳转北京时间日期（旧站 dateline 为秒级时间戳）。 */
export function formatPublishedAt(dateline) {
  const seconds = Number.parseInt(String(dateline ?? ''), 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return null
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  if (beijing.getUTCFullYear() < 1990) return null
  return beijing.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * 解析一条旧库文章行。
 * 输入字段：legacy_source_table、legacy_source_id、title、dateline、content。
 */
export function parseLegacyArticle(row, { legacyProjectTitle = '', usedSlugs = new Set() } = {}) {
  const title = String(row.title ?? '').trim()
  const rawContent = String(row.content ?? '')
  const sanitized = sanitizeHtml(rawContent)
  const plainText = stripLegacyUgc(htmlToPlainText(sanitized))
  const reviewReasons = []
  if (!title) reviewReasons.push('empty_title')
  if (!plainText) reviewReasons.push('empty_content')

  const sourceTable = String(row.legacy_source_table ?? 'cn_list')
  const sourceId = String(row.legacy_source_id ?? '')

  return {
    sourceTable,
    sourceId,
    slug: buildArticleSlug(title, sourceTable, sourceId, usedSlugs),
    title,
    contentHtml: sanitized,
    contentText: plainText,
    publishedAt: formatPublishedAt(row.dateline),
    sourceProjectTitle: legacyProjectTitle,
    caseCandidates: extractCaseCandidates(title, rawContent),
    mediaReferences: extractMediaReferences(sanitized),
    hasContent: plainText.length > 0,
    reviewReasons,
  }
}
