// 服务端正文 HTML 清洗（公开文章详情，纵深防御）。
//
// 为什么不直接复用 tools/migrate-legacy/legacy-parser.mjs 的 sanitizeHtml？
//   - 迁移脚本属于开发期工具，不在 web 的依赖与部署产物内；服务端 import 它会把整个
//     迁移解析器（旧库字段提取、媒体整理等）带进 Nitro 构建，且工具改动会直接影响线上输出。
//   - 因此服务端保留一份等价但更严格的实现：标签白名单与迁移脚本一致，属性只保留
//     a[href] / img[src,alt]，并且 img 只接受绝对 http(s) 地址（旧站 res/... 相对路径
//     在公开站点会 404，直接丢弃而不是输出坏图）。
//   - 迁移时已清洗一次，输出前再清洗一次纯属纵深防御：绝不信任库里的历史标记。
// 调整白名单时请同步检查 tools/migrate-legacy/legacy-parser.mjs，保持两边口径一致。

/** 允许保留的标签，与迁移脚本的 ALLOWED_TAGS 保持一致。 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'section', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'figure', 'figcaption',
  'img', 'a', 'hr', 'pre', 'code',
])

const VOID_TAGS = new Set(['br', 'img', 'hr'])

/**
 * 这些标签的内容是“原始文本”，一旦出现未闭合的开始标签，
 * 必须连同其后内容一起丢弃，否则脚本源码会被当成可见正文输出。
 */
const RAW_CONTENT_TAGS = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg', 'math'])

const NAMED_ENTITIES: Record<string, string> = {
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

function safeFromCodePoint(code: number, fallback: string): string {
  if (code < 0 || code > 0x10FFFF) return fallback
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/** 单次解码 HTML 实体；不递归，避免 &amp;amp; 被展开两次。 */
export function decodeEntities(text: unknown): string {
  return String(text ?? '').replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** 是否是协议白名单之外的地址（javascript:、vbscript:、file:、data:）。 */
function isDangerousUrl(url: string): boolean {
  return /^(?:javascript|vbscript|file|data)\s*:/i.test(url) || /[\u0000-\u001F]/.test(url)
}

/** 链接地址：允许绝对 http(s)、协议相对 // 与站内根路径 /；其余（含 res/... 相对路径）丢弃。 */
function pickHref(url: unknown): string {
  const value = decodeEntities(url).trim()
  if (!value || isDangerousUrl(value)) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return value
  return ''
}

/** 图片地址：只保留公网可访问的绝对地址，旧站 res/... 相对路径一律丢弃。 */
function pickImageSrc(url: unknown): string {
  const value = decodeEntities(url).trim()
  if (!value || isDangerousUrl(value)) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  return ''
}

function escapeText(text: string): string {
  return text.replace(/&(?![A-Za-z#][A-Za-z0-9]*;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(rawAttributes ?? '')) !== null) {
    const name = match[1]!.toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attributes[name] = decodeEntities(value).trim()
  }
  return attributes
}

/**
 * 属性白名单：只有 a 的 href 与 img 的 src/alt 会被保留。
 * style、class、id、事件属性（on*）以及 target 等一律丢弃。
 */
function sanitizeAttributes(tag: string, rawAttributes: string): string {
  const parsed = parseAttributes(rawAttributes)
  const kept: string[] = []
  if (tag === 'a') {
    const href = pickHref(parsed.href)
    if (href) {
      kept.push(`href="${escapeAttribute(href)}"`)
      kept.push('rel="noopener noreferrer"')
    }
  }
  if (tag === 'img') {
    const src = pickImageSrc(parsed.src)
    if (!src) return ''
    kept.push(`src="${escapeAttribute(src)}"`)
    const alt = parsed.alt || parsed.title || ''
    if (alt) kept.push(`alt="${escapeAttribute(alt)}"`)
  }
  return kept.length > 0 ? ` ${kept.join(' ')}` : ''
}

/** 白名单清洗 HTML：保留正文结构，去掉脚本、iframe、事件属性、style 与危险链接。 */
export function sanitizeHtml(html: unknown): string {
  const source = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe|object|embed|template|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')

  const output: string[] = []
  const tagStack: string[] = []
  const tokenPattern = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(source)) !== null) {
    output.push(escapeText(source.slice(lastIndex, match.index)))
    lastIndex = tokenPattern.lastIndex

    const [, closing, rawTag, rawAttributes, selfClosing] = match
    const tag = rawTag!.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) {
      // 未闭合的 script / style 等：连同其后内容一起跳过，避免源码变成可见正文。
      if (!closing && RAW_CONTENT_TAGS.has(tag)) {
        const closePattern = new RegExp(`</${tag}\\s*>`, 'i')
        closePattern.lastIndex = tokenPattern.lastIndex
        const closeMatch = closePattern.exec(source)
        const resumeAt = closeMatch ? closePattern.lastIndex : source.length
        tokenPattern.lastIndex = resumeAt
        lastIndex = resumeAt
      }
      continue
    }

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

    const attributes = sanitizeAttributes(tag, rawAttributes ?? '')
    // img 没有可用的安全地址时整标签丢弃，不留空占位。
    if (tag === 'img' && !attributes) continue
    output.push(`<${tag}${attributes}>`)
    if (!VOID_TAGS.has(tag) && !selfClosing) tagStack.push(tag)
  }

  output.push(escapeText(source.slice(lastIndex)))
  while (tagStack.length > 0) output.push(`</${tagStack.pop()}>`)

  return output.join('').replace(/\s{2,}/g, ' ').trim()
}

/**
 * 后台富文本简介 → 可安全渲染的 HTML。
 *
 * 数据来源不统一：小程序后台有的字段是富文本 HTML（带 `<p style>`），有的是纯文本段落。
 * 含标签时按白名单清洗；纯文本按空行分段包成 `<p>`，避免整段挤成一行。
 */
export function toSafeRichText(input: unknown): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  if (!/<\/?[a-z][\s\S]*?>/i.test(raw)) {
    return raw
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => `<p>${sanitizeHtml(paragraph).replace(/\s*\n\s*/g, '<br>')}</p>`)
      .join('')
  }
  // 富文本里常见的「空段落 + <br>」没有实际内容，清洗后顺手去掉，避免页面顶部出现大片空白。
  return sanitizeHtml(raw).replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '')
}
