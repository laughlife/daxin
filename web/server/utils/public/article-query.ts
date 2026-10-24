// 文章公开接口的纯函数层：筛选参数归一化、配图选择、响应映射。
//
// 与其他 public 工具一致：不访问数据库、不依赖 Nuxt 运行时，可直接在 node:test 中单测
// （见 web/scripts/public-api-articles.test.mjs）。分页夹取统一复用 ./query.ts 的
// resolvePageWindow，本文件不重复实现。
//
// 相对导入显式带 .ts 后缀：node 的类型剥离不做扩展名补全，
// 而 Nuxt 生成的 tsconfig 已开启 allowImportingTsExtensions。
import { normalizeDateOnly, normalizeText } from './query.ts'

/**
 * 文章列表项，字段与 docs/superpowers/task6-data-contract.md 的 ArticleSummary 一致。
 * 内部迁移字段（migration_batch_id、legacy_source_* 等）一律不出现。
 */
export interface ArticleSummary {
  id: string
  slug: string
  title: string
  category: string
  publishedAt: string
  href: string
  imageSrc: string | null
  imageAlt: string
  /** 标题字号（px）：取自微信原文，为空时前端用默认字号 */
  titleFontSize: number | null
}

/** 归一化后的文章列表筛选条件；空串表示未筛选。 */
export interface ArticleFilters {
  category: string
  sourceKey: 'tro-2025-album' | 'tro-2026-album' | ''
  keyword: string
  from: string
  to: string
}

/** 分类 slug 白名单形态：小写字母数字与连字符（article_categories.slug）。 */
const CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const ALBUM_SOURCE_KEYS = new Set(['tro-2025-album', 'tro-2026-album'])
/** 关键词长度上限，避免超长输入拖垮 LIKE 查询。 */
const MAX_KEYWORD_LENGTH = 60

/**
 * 解析文章列表查询参数。任何输入都不会被“拒绝”，只会被归一化：
 * 非法分类 / 非法日期被丢弃，反向日期区间的上界被忽略。
 */
export function parseArticleFilters(input?: Record<string, unknown> | null): ArticleFilters {
  const source = input ?? {}
  const category = normalizeText(source.category).toLowerCase()
  const sourceKey = normalizeText(source.sourceKey).toLowerCase()
  const from = normalizeDateOnly(source.from)
  const to = normalizeDateOnly(source.to)
  return {
    category: CATEGORY_SLUG_PATTERN.test(category) ? category : '',
    sourceKey: ALBUM_SOURCE_KEYS.has(sourceKey) ? sourceKey as ArticleFilters['sourceKey'] : '',
    keyword: normalizeText(source.keyword).slice(0, MAX_KEYWORD_LENGTH),
    from,
    // from > to 时结果必然为空，丢弃上界，避免把区间写反伪装成“没有内容”。
    to: to && from && to < from ? '' : to,
  }
}

/**
 * 转义 LIKE 模式中的通配符（配合 SQL 中的 ESCAPE '!'）。
 * 用户输入的 % 与 _ 必须当普通字符处理，否则会变成隐式通配匹配。
 */
export function escapeLikePattern(value: string): string {
  return String(value ?? '').replace(/[!%_]/g, char => `!${char}`)
}

/**
 * 公网可访问的绝对图片地址；其余（含旧站本地 res/... 路径）一律返回 null。
 *
 * 旧站图片以 `res/202501/03/xxx.png` 形式存在 article_images.source_url 中，
 * 这类相对路径在公开站点会 404，因此绝不作为图片地址返回；`public_url` 为空
 * （media_assets 尚未上传 OSS）时同样视为不可用。
 */
export function toPublicImageUrl(value: unknown): string | null {
  const url = normalizeText(value)
  if (!url) return null
  if (/[\u0000-\u001F]/.test(url)) return null
  if (/^(?:data|javascript|vbscript|file)\s*:/i.test(url)) return null
  if (/^https?:\/\//i.test(url)) return url
  if (/^\/\//.test(url)) return `https:${url}`
  return null
}

export interface ArticleImageInput {
  /** articles.cover_media_id → media_assets.public_url */
  coverUrl?: unknown
  /** 正文第一张配图的 media_assets.public_url */
  imageUrl?: unknown
  /** 正文第一张配图的原始外链 article_images.source_url */
  sourceUrl?: unknown
  alt?: unknown
  title?: unknown
}

/**
 * 配图选择顺序：封面 OSS 地址 → 正文第一张配图的 OSS 地址 → 原文 https 绝对外链 → null。
 * 最后一级只接受 https（http 外链在 https 页面会被浏览器判为混合内容而拦截）。
 */
export function pickArticleImageSrc(input: ArticleImageInput): string | null {
  const cover = toPublicImageUrl(input.coverUrl)
  if (cover) return cover
  const first = toPublicImageUrl(input.imageUrl)
  if (first) return first
  const source = normalizeText(input.sourceUrl)
  return /^https:\/\//i.test(source) ? source : null
}

/** 配图替代文本：优先 article_images.alt_text，其次文章标题。 */
export function pickArticleImageAlt(input: ArticleImageInput): string {
  return normalizeText(input.alt) || normalizeText(input.title)
}

/**
 * 文章详情页路径前缀。契约未固定路径，这里沿用站点导航的分类口径，
 * 未知分类回落到 /tro/news（与 mock 文章 href 的写法一致）。
 */
const SECTION_PATHS: Record<string, string> = {
  'tro-alert': '/tro/alerts',
  'patent-alert': '/tro/patent-alerts',
  'tro-success': '/tro/success-cases',
  'cpsc-recalls': '/tro/cpsc-recalls',
  knowledge: '/tro/guides',
  news: '/tro/news',
  'labor-case': '/domestic/labor-disputes',
  'freight-case': '/domestic/freight-cases',
  'cross-border-consulting': '/domestic/cross-border-news',
}

export const DEFAULT_ARTICLE_SECTION_PATH = '/tro/news'

export function articleHref(categorySlug: string, slug: string): string {
  const base = SECTION_PATHS[normalizeText(categorySlug).toLowerCase()] ?? DEFAULT_ARTICLE_SECTION_PATH
  return `${base}/${slug}`
}

/** 数据库行 → ArticleSummary 所需的列（published_at 已在 SQL 中 DATE_FORMAT）。 */
export interface ArticleRow {
  id: number | string | null
  slug: string | null
  title: string | null
  published_at: string | Date | null
  category_slug?: string | null
  /** article_categories.name：对外的中文展示分类。 */
  category_name?: string | null
  /** 关联表带来的栏目 slug（首页按栏目取数时使用） */
  link_category_slug?: string | null
  /** 公众号或旧站原文地址；存在时列表标题和封面直接跳转原文。 */
  source_url?: string | null
  cover_url?: string | null
  /** articles.title_font_size：微信原文标题字号，前台按此渲染 */
  title_font_size?: number | null
  image_url?: string | null
  image_source_url?: string | null
  image_alt?: string | null
}

/** 只允许公众号公开文章链接，避免数据库中的错误地址变成任意外链跳转。 */
export function toWechatArticleUrl(value: unknown): string | null {
  const raw = normalizeText(value)
  if (!raw || /[\u0000-\u001F]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com') return null
    if (!/^\/(?:s(?:\/|\?|$)|mp\/s\b)/i.test(url.pathname)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

/** 仅允许已知公众号文章与旧站文章路径作为文章原文链接。 */
export function toArticleSourceUrl(value: unknown): string | null {
  const raw = normalizeText(value)
  const wechatUrl = toWechatArticleUrl(raw)
  if (wechatUrl) return wechatUrl
  if (!raw || /[\u0000-\u001F]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'daxinfawu.com' || url.port || url.username || url.password) return null
    if (!/^\/(?:case|crossing|domestic|dynamic|news|overseas|tro)\/\d+\.html$/i.test(url.pathname)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

/** published_at 只用 YYYY-MM-DD；SQL 已格式化，这里仅做防御性截断。 */
function toDateOnlyText(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const pad = (part: number): string => String(part).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value !== 'string') return ''
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match ? match[1]! : ''
}

/**
 * articles.title_font_size → 可用的字号（px）。
 * 微信侧偶尔给出异常值，超出合理范围一律视为未配置，交给前端默认字号。
 */
function normalizeFontSize(value: unknown): number | null {
  const size = Number(value)
  if (!Number.isFinite(size)) return null
  const rounded = Math.round(size)
  return rounded >= 10 && rounded <= 40 ? rounded : null
}

export function toArticleSummary(row: ArticleRow): ArticleSummary {
  const slug = normalizeText(row.slug)
  const title = normalizeText(row.title)
  const categorySlug = normalizeText(row.category_slug).toLowerCase()
  const sourceUrl = toArticleSourceUrl(row.source_url)
  const imageInput: ArticleImageInput = {
    coverUrl: row.cover_url,
    imageUrl: row.image_url,
    sourceUrl: row.image_source_url,
    alt: row.image_alt,
    title,
  }
  return {
    id: row.id === null || row.id === undefined ? '' : String(row.id),
    slug,
    title,
    // 对外展示中文分类名（与 CaseRecord.category 的口径一致）；分类缺失时回落到 slug。
    category: normalizeText(row.category_name) || categorySlug,
    publishedAt: toDateOnlyText(row.published_at),
    href: sourceUrl ?? articleHref(categorySlug, slug),
    imageSrc: sourceUrl ? toPublicImageUrl(row.cover_url) : pickArticleImageSrc(imageInput),
    imageAlt: pickArticleImageAlt(imageInput),
    titleFontSize: normalizeFontSize(row.title_font_size),
  }
}
