const ARTICLE_ORIGIN = 'https://mp.weixin.qq.com'

const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·',
  hellip: '…', mdash: '—', ndash: '–',
})

export function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x?[\da-f]+|[a-z]+);/gi, (match, entity) => {
    if (/^#x/i.test(entity)) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) && code <= 0x10FFFF ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code <= 0x10FFFF ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function parseAttributes(raw = '') {
  const attributes = {}
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g
  for (const match of raw.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '').trim()
  }
  return attributes
}

function normalizeArticleUrl(value, baseUrl = ARTICLE_ORIGIN) {
  const text = decodeHtmlEntities(value).trim()
  if (!text) return ''
  try {
    const url = new URL(text, baseUrl)
    /*
     * 允许 http 并统一升级为 https。
     *
     * 微信专辑页的 data-link 实测会给出 `http://mp.weixin.qq.com/s?...`，
     * 而 mp.weixin.qq.com 实际只提供 https。此前这里硬性要求 https，
     * 导致每个条目的 url 都被判为空、整页解析出 0 条，
     * 于是全量任务报「公众号专辑页面未解析到完整文章条目」。
     * 协议细节不该让整次采集失败，按站点实际协议规范化即可。
     */
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (url.hostname !== 'mp.weixin.qq.com') return ''
    if (!/^\/(?:s(?:\/|\?|$)|mp\/s\b)/i.test(url.pathname)) return ''
    url.protocol = 'https:'
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function normalizeImageUrl(value) {
  const text = decodeHtmlEntities(value).trim()
  if (!text || /^(?:data|blob):/i.test(text)) return ''
  try {
    const url = new URL(text.startsWith('//') ? `https:${text}` : text, ARTICLE_ORIGIN)
    // 允许 http 并统一升级为 https：微信专辑页的封面地址会出现 http://mmbiz.qpic.cn/...
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return ''
  }
}

function textFromHtml(value) {
  return decodeHtmlEntities(String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

function elementHtmlById(html, wantedId) {
  const openPattern = /<([a-z][\w:-]*)\b([^>]*)>/gi
  let opening
  while ((opening = openPattern.exec(html)) !== null) {
    if (parseAttributes(opening[2]).id !== wantedId) continue
    const tag = opening[1].toLowerCase()
    const start = opening.index
    const scan = /<!--[^]*?-->|<\/?([a-z][\w:-]*)\b[^>]*>/gi
    scan.lastIndex = openPattern.lastIndex
    let depth = 1
    let token
    while ((token = scan.exec(html)) !== null) {
      const tokenText = token[0]
      const name = (token[1] ?? '').toLowerCase()
      if (!name) continue
      // 忽略脚本和样式的原始文本，避免其中出现的字符串影响标签配对。
      if (!tokenText.startsWith('</') && (name === 'script' || name === 'style')) {
        const close = new RegExp(`<\\/${name}\\s*>`, 'ig')
        close.lastIndex = scan.lastIndex
        const end = close.exec(html)
        if (!end) return html.slice(start)
        scan.lastIndex = close.lastIndex
        continue
      }
      if (name !== tag) continue
      if (tokenText.startsWith('</')) {
        depth -= 1
        if (depth === 0) return html.slice(start, scan.lastIndex)
      } else if (!/\/\s*>$/.test(tokenText) && !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(name)) {
        depth += 1
      }
    }
    return ''
  }
  return ''
}

function getMetaContent(html, key) {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const meta of metas) {
    const attrs = parseAttributes(meta.replace(/^<meta\b/i, '').replace(/>$/, ''))
    if ([attrs.property, attrs.name, attrs.itemprop].some(value => value?.toLowerCase() === key.toLowerCase())) {
      return attrs.content ?? ''
    }
  }
  return ''
}

function getTextById(html, id) {
  return textFromHtml(elementHtmlById(html, id))
}

function parseCreateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  let date
  if (/^\d{10}$/.test(text)) date = new Date(Number(text) * 1000)
  else if (/^\d{13}$/.test(text)) date = new Date(Number(text))
  else {
    const normalized = text
      .replace(/[年月]/g, '-')
      .replace(/日/g, '')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
    if (match) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
      date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), Number(second)))
    } else {
      const fallback = Date.parse(text)
      if (Number.isFinite(fallback)) date = new Date(fallback)
    }
  }
  if (!date || Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`
}

function parseCoverStyle(style) {
  const match = String(style ?? '').match(/url\(\s*["']?([^"')]+)["']?\s*\)/i)
  return normalizeImageUrl(match?.[1] ?? '')
}

function parseAlbumItem(html, baseUrl) {
  const opening = /^<li\b([^>]*)>/i.exec(html)
  const attrs = parseAttributes(opening?.[1] ?? '')
  const timeHtml = elementHtmlByClass(html, 'js_article_create_time')
  const imageHtml = elementHtmlByClass(html, 'album__item-img')
  const imageTag = /^<[^>]+>/i.exec(imageHtml)?.[0] ?? ''
  const imageAttrs = parseAttributes(imageTag.replace(/^<[^\s>]+/i, '').replace(/>$/, ''))
  return {
    messageId: String(attrs['data-msgid'] ?? '').trim(),
    itemIndex: String(attrs['data-itemidx'] ?? '').trim(),
    url: normalizeArticleUrl(attrs['data-link'] ?? '', baseUrl),
    title: String(attrs['data-title'] ?? '').replace(/\s+/g, ' ').trim(),
    publishedAt: parseCreateTime(textFromHtml(timeHtml)),
    coverUrl: parseCoverStyle(imageAttrs.style),
  }
}

function elementHtmlByClass(html, wantedClass) {
  const openingPattern = /<([a-z][\w:-]*)\b([^>]*)>/gi
  let opening
  while ((opening = openingPattern.exec(html)) !== null) {
    const attrs = parseAttributes(opening[2])
    if (!(attrs.class ?? '').split(/\s+/).includes(wantedClass)) continue
    const tag = opening[1].toLowerCase()
    const close = new RegExp(`<\\/${tag}\\s*>`, 'ig')
    close.lastIndex = openingPattern.lastIndex
    const ending = close.exec(html)
    return ending ? html.slice(opening.index, close.lastIndex) : html.slice(opening.index, openingPattern.lastIndex)
  }
  return ''
}

function parseAlbumItems(html, baseUrl) {
  const items = []
  const pattern = /<li\b([^>]*)>/gi
  let opening
  while ((opening = pattern.exec(html)) !== null) {
    const attrs = parseAttributes(opening[1])
    if (!(attrs.class ?? '').split(/\s+/).includes('album__list-item')) continue
    const close = /<\/li\s*>/ig
    close.lastIndex = pattern.lastIndex
    const ending = close.exec(html)
    if (!ending) break
    const item = parseAlbumItem(html.slice(opening.index, close.lastIndex), baseUrl)
    if (item.messageId && item.itemIndex && item.url && item.title) items.push(item)
    pattern.lastIndex = close.lastIndex
  }
  return items
}

function continueFlagFromHtml(html) {
  const match = html.match(/continue_flag\s*:\s*['"]?(\d+)['"]?\s*\*\s*1\s*,\s*reverse_continue_flag/i)
    ?? html.match(/(?:"|')continue_flag(?:"|')\s*:\s*(\d+)/i)
  return match?.[1] === '1'
}

export function parseAlbumPage(html, pageUrl) {
  const source = String(html ?? '')
  if (!source.includes('album__content') && !source.includes('album__list-item')) {
    throw new Error('公众号专辑页面没有可读取的文章列表')
  }
  const items = parseAlbumItems(source, pageUrl)
  if (!items.length) throw new Error('公众号专辑页面未解析到完整文章条目')
  return { items, hasMore: continueFlagFromHtml(source) }
}

function articleFromJson(item) {
  const messageId = String(item?.msgid ?? item?.msg_id ?? '').trim()
  const itemIndex = String(item?.itemidx ?? item?.item_idx ?? '').trim()
  const url = normalizeArticleUrl(item?.url ?? item?.link ?? '')
  const title = String(item?.title ?? '').replace(/\s+/g, ' ').trim()
  return {
    messageId,
    itemIndex,
    url,
    title,
    publishedAt: parseCreateTime(item?.create_time ?? item?.publish_time ?? ''),
    coverUrl: normalizeImageUrl(item?.cover_img_1_1 ?? item?.cover ?? ''),
  }
}

export function parseAlbumJsonPage(body) {
  let data
  try { data = typeof body === 'string' ? JSON.parse(body) : body } catch {
    throw new Error('公众号专辑分页响应不是有效 JSON')
  }
  const album = data?.getalbum_resp
  if (Number(data?.base_resp?.ret ?? 0) !== 0 || !album) {
    throw new Error('公众号专辑分页响应没有可读取的文章数据')
  }
  const list = album.article_list
  const rawItems = Array.isArray(list) ? list : list && typeof list === 'object' ? [list] : []
  const items = rawItems.map(articleFromJson).filter(item => item.messageId && item.itemIndex && item.url && item.title)
  if (!items.length) throw new Error('公众号专辑分页没有完整文章条目')
  return { items, hasMore: Number(album.continue_flag ?? 0) === 1 }
}

export function parseWechatArticlePage(html, articleUrl) {
  const source = String(html ?? '')
  if (/环境异常|操作频繁|安全验证|请在微信客户端打开|访问过于频繁/i.test(source)) {
    throw new Error('公众号原文页面返回了访问限制，已停止抓取')
  }
  const bodyHtml = elementHtmlById(source, 'js_content')
  if (!bodyHtml) throw new Error('公众号原文页面没有正文内容')
  const title = textFromHtml(elementHtmlById(source, 'activity-name'))
    || textFromHtml(elementHtmlById(source, 'js_article_title'))
    || textFromHtml(elementHtmlById(source, 'activity-name'))
    || textFromHtml(getMetaContent(source, 'og:title'))
    || textFromHtml(getMetaContent(source, 'twitter:title'))
  const publishedAt = parseCreateTime(getTextById(source, 'publish_time'))
    || parseCreateTime(getMetaContent(source, 'article:published_time'))
    || parseCreateTime(getMetaContent(source, 'og:release_date'))
  const coverUrl = normalizeImageUrl(getMetaContent(source, 'og:image'))
  const accountName = getTextById(source, 'js_name') || textFromHtml(getMetaContent(source, 'og:article:author'))
  const imageUrls = []
  const seen = new Set()
  for (const match of bodyHtml.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1])
    const url = normalizeImageUrl(attrs['data-src'] ?? attrs['data-original'] ?? attrs['data-actualsrc'] ?? attrs.src ?? '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    imageUrls.push({ url, alt: String(attrs.alt ?? attrs.title ?? '').trim() })
  }
  return {
    url: normalizeArticleUrl(articleUrl),
    title,
    publishedAt,
    coverUrl,
    accountName,
    bodyHtml,
    imageUrls,
  }
}

export function canonicalArticleUrl(value) {
  const normalized = normalizeArticleUrl(value)
  if (!normalized) return ''
  const url = new URL(normalized)
  for (const key of ['scene', 'subscene', 'scenenote', 'from', 'isappinstalled', 'enterid', 'clicktime']) {
    url.searchParams.delete(key)
  }
  url.searchParams.sort()
  return url.toString()
}

export function parseWechatPublishedAt(value) {
  return parseCreateTime(value)
}
