import { decodeHtmlEntities } from './parser.mjs'

const IMAGE_HOSTS = new Set(['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'wx.qlogo.cn', 'res.wx.qq.com'])

function parseAttributes(raw = '') {
  const attributes = {}
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g
  for (const match of raw.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '').trim()
  }
  return attributes
}

export function normalizeWechatImageUrl(value) {
  const text = decodeHtmlEntities(value).trim()
  if (!text || /^(?:data|blob):/i.test(text)) return ''
  try {
    const url = new URL(text.startsWith('//') ? `https:${text}` : text)
    /*
     * 允许 http 并统一升级为 https。
     *
     * 与文章链接同一类问题：微信专辑页里的封面地址实测会出现
     * `http://mmbiz.qpic.cn/...`，而该域名实际只提供 https。
     * 此前这里硬性要求 https，导致这类封面被判为空，
     * 表现为「文章没有可读取的封面图片」。
     */
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (!IMAGE_HOSTS.has(url.hostname.toLowerCase())) return ''
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return ''
  }
}

export function wechatImageIdentity(value) {
  const normalized = normalizeWechatImageUrl(value)
  if (!normalized) return ''
  const url = new URL(normalized)
  return `${url.hostname}${url.pathname}`
}

export function getWechatBodyImages(html, coverUrl = '') {
  const coverIdentity = wechatImageIdentity(coverUrl)
  const seen = new Set()
  const images = []
  for (const match of String(html ?? '').matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1])
    const url = normalizeWechatImageUrl(attrs['data-src'] ?? attrs['data-original'] ?? attrs['data-actualsrc'] ?? attrs.src ?? '')
    if (!url) continue
    const identity = wechatImageIdentity(url)
    if (identity === coverIdentity || seen.has(identity)) continue
    seen.add(identity)
    images.push({ url, alt: String(attrs.alt ?? attrs.title ?? '').slice(0, 255), identity })
  }
  return images
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 用 OSS 地址替换微信正文图；任何未被映射的 img 都被移除，避免留下外链。 */
export function replaceWechatBodyImages(html, mediaByIdentity) {
  return String(html ?? '').replace(/<img\b([^>]*)>/gi, (tag, rawAttrs) => {
    const attrs = parseAttributes(rawAttrs)
    const sourceUrl = normalizeWechatImageUrl(attrs['data-src'] ?? attrs['data-original'] ?? attrs['data-actualsrc'] ?? attrs.src ?? '')
    const media = mediaByIdentity.get(wechatImageIdentity(sourceUrl))
    if (!media?.publicUrl) return ''
    const alt = String(attrs.alt ?? attrs.title ?? '').trim()
    return `<img src="${escapeAttribute(media.publicUrl)}"${alt ? ` alt="${escapeAttribute(alt)}"` : ''}>`
  })
}

export function appendWechatSourceLink(html, sourceUrl) {
  const safeUrl = String(sourceUrl ?? '').trim()
  let parsed
  try { parsed = new URL(safeUrl) } catch { return String(html ?? '') }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'mp.weixin.qq.com') return String(html ?? '')
  return `${String(html ?? '')}<p><a href="${escapeAttribute(parsed.toString())}">查看微信公众号原文</a></p>`
}

export function htmlToPlainText(html) {
  return decodeHtmlEntities(String(html ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}
