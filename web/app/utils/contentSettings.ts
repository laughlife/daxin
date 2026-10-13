export type ContentSidebarKey = 'tro' | 'labor' | 'cross-border'
export type SidebarQrGroup = 'tro' | 'labor' | 'all'
export type SidebarQrId = 'tro-public' | 'tro-consult' | 'labor-public' | 'labor-consult'

export interface ContentSidebarLink {
  key: ContentSidebarKey
  label: string
  path: string
  enabled: boolean
  sortOrder: number
}

export interface ContentSidebarConfig {
  faqTitle: string
  faqLinks: ContentSidebarLink[]
  publicHeading: string
  consultHeading: string
}

export type LegalGuideSlug = 'tro' | 'labor' | 'logistics'

export interface LegalGuideSlide {
  slug: LegalGuideSlug
  category: string
  title: string
  paragraphs: string[]
  image: string
  imageAlt: string
  benefit: string
  accent: string
  qrItemKey: 'qr-tro-consult' | 'qr-labor-consult' | ''
}

const SIDEBAR_LINK_DEFAULTS: ContentSidebarLink[] = [
  { key: 'tro', label: 'TRO 常见问题', path: '/faq/tro', enabled: true, sortOrder: 10 },
  { key: 'labor', label: '劳动争议', path: '/faq/labor', enabled: true, sortOrder: 20 },
  { key: 'cross-border', label: '跨境干货', path: '/faq/cross-border', enabled: true, sortOrder: 30 },
]

const SIDEBAR_DEFAULTS: ContentSidebarConfig = {
  faqTitle: '常见问题',
  faqLinks: SIDEBAR_LINK_DEFAULTS,
  publicHeading: '关注公众号了解咨询',
  consultHeading: '添加咨询号沟通案件',
}

export const DEFAULT_LEGAL_GUIDES: LegalGuideSlide[] = [
  {
    slug: 'tro',
    category: '跨境tro',
    title: '《破解TRO跨境难题》',
    paragraphs: [
      '卖家最头疼的跨境困局：被美国律所起诉、店铺被锁、资金冻结、链接强制下架，若不及时处理，很可能钱店两空，我们专注各类TRO案件，提供低价和解、资金解冻、店铺解封等服务；同行搞不定的疑难案件，也能高效破局',
    ],
    image: '/images/guides/tro.png',
    imageAlt: '跨境 TRO 法律指南',
    benefit: '历年TRO侵权案例集锦',
    accent: '#642a86',
    qrItemKey: 'qr-tro-consult',
  },
  {
    slug: 'labor',
    category: '劳动法',
    title: '《懂法用工，规避风险》',
    paragraphs: [
      '还在忽视用工细节？结合近年劳动仲裁大数据，当前企业用工形势日趋严峻，核心风险集中在员工法律意识提升后离职时集中仲裁、企业因用工不规范频发高额赔付，以及事后补救困难且损害企业声誉这三点',
      '与其事后被动应对，不如提前合规布局，以懂法用工实现风险前置管理，护航企业稳健经营',
    ],
    image: '/images/guides/labor-law.png',
    imageAlt: '劳动用工合规指南',
    benefit: '免费领取《88项用工风险自查表》',
    accent: '#a84d18',
    qrItemKey: 'qr-labor-consult',
  },
  {
    slug: 'logistics',
    category: '国际物流',
    title: '',
    paragraphs: [],
    image: '',
    imageAlt: '国际物流法律指南',
    benefit: '',
    accent: '#216695',
    qrItemKey: '',
  },
]

const FAQ_PATHS: Record<ContentSidebarKey, string> = {
  tro: '/faq/tro',
  labor: '/faq/labor',
  'cross-border': '/faq/cross-border',
}

const LEGAL_GUIDE_SLUGS: LegalGuideSlug[] = ['tro', 'labor', 'logistics']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readText(value: unknown, fallback: string, maxLength = 2000): string {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text ? text.slice(0, maxLength) : fallback
}

function cloneDefaultSidebar(): ContentSidebarConfig {
  return {
    ...SIDEBAR_DEFAULTS,
    faqLinks: SIDEBAR_LINK_DEFAULTS.map(link => ({ ...link })),
  }
}

export function normalizeContentSidebar(value: unknown): ContentSidebarConfig {
  if (!isRecord(value)) return cloneDefaultSidebar()

  const base = cloneDefaultSidebar()
  const sourceLinks = Array.isArray(value.faqLinks) ? value.faqLinks : []
  const suppliedByKey = new Map<ContentSidebarKey, Record<string, unknown>>()
  for (const candidate of sourceLinks) {
    if (!isRecord(candidate)) continue
    const key = candidate.key
    if (key === 'tro' || key === 'labor' || key === 'cross-border') suppliedByKey.set(key, candidate)
  }

  const faqLinks = base.faqLinks.map((fallback) => {
    const candidate = suppliedByKey.get(fallback.key)
    if (!candidate) return fallback
    const order = Number(candidate.sortOrder)
    return {
      ...fallback,
      label: readText(candidate.label, fallback.label, 80),
      // A route is canonical for its key; user-controlled values can never introduce an external URL.
      path: FAQ_PATHS[fallback.key],
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled,
      sortOrder: Number.isFinite(order) && order >= 0 ? Math.min(Math.trunc(order), 9999) : fallback.sortOrder,
    }
  }).sort((a, b) => a.sortOrder - b.sortOrder || SIDEBAR_LINK_DEFAULTS.findIndex(link => link.key === a.key) - SIDEBAR_LINK_DEFAULTS.findIndex(link => link.key === b.key))

  return {
    faqTitle: readText(value.faqTitle, base.faqTitle, 80),
    faqLinks,
    publicHeading: readText(value.publicHeading, base.publicHeading, 80),
    consultHeading: readText(value.consultHeading, base.consultHeading, 80),
  }
}

export function sidebarQrIds(group: SidebarQrGroup): [SidebarQrId, SidebarQrId] {
  return group === 'labor'
    ? ['labor-public', 'labor-consult']
    : ['tro-public', 'tro-consult']
}

function cloneDefaultLegalGuides(): LegalGuideSlide[] {
  return DEFAULT_LEGAL_GUIDES.map(slide => ({ ...slide, paragraphs: [...slide.paragraphs] }))
}

function safeImage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const image = value.trim()
  if (image.startsWith('/') && !image.startsWith('//')) return image
  if (/^https:\/\//i.test(image)) return image
  return fallback
}

function safeAccent(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim()) ? value.trim() : fallback
}

function safeGuideQrKey(value: unknown, slug: LegalGuideSlug, fallback: LegalGuideSlide['qrItemKey']): LegalGuideSlide['qrItemKey'] {
  if (slug === 'tro' && value === 'qr-tro-consult') return value
  if (slug === 'labor' && value === 'qr-labor-consult') return value
  if (slug === 'logistics' && value === '') return ''
  return fallback
}

export function normalizeLegalGuideSlides(value: unknown): LegalGuideSlide[] {
  if (!Array.isArray(value) || value.length !== LEGAL_GUIDE_SLUGS.length) return cloneDefaultLegalGuides()

  const bySlug = new Map<LegalGuideSlug, Record<string, unknown>>()
  for (const candidate of value) {
    if (!isRecord(candidate)) return cloneDefaultLegalGuides()
    const slug = candidate.slug
    if (slug !== 'tro' && slug !== 'labor' && slug !== 'logistics') return cloneDefaultLegalGuides()
    if (bySlug.has(slug)) return cloneDefaultLegalGuides()
    bySlug.set(slug, candidate)
  }
  if (LEGAL_GUIDE_SLUGS.some(slug => !bySlug.has(slug))) return cloneDefaultLegalGuides()

  const defaults = cloneDefaultLegalGuides()
  return defaults.map((fallback) => {
    const candidate = bySlug.get(fallback.slug)!
    const paragraphs = Array.isArray(candidate.paragraphs)
      ? candidate.paragraphs.filter((paragraph): paragraph is string => typeof paragraph === 'string').map(paragraph => paragraph.trim()).filter(Boolean)
      : fallback.paragraphs
    return {
      ...fallback,
      category: readText(candidate.category, fallback.category, 80),
      title: typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 160) : fallback.title,
      paragraphs,
      image: safeImage(candidate.image, fallback.image),
      imageAlt: readText(candidate.imageAlt, fallback.imageAlt, 160),
      benefit: typeof candidate.benefit === 'string' ? candidate.benefit.trim().slice(0, 160) : fallback.benefit,
      accent: safeAccent(candidate.accent, fallback.accent),
      qrItemKey: safeGuideQrKey(candidate.qrItemKey, fallback.slug, fallback.qrItemKey),
    }
  })
}
