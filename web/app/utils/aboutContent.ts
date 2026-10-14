import type { PublicSettings } from '~/repositories/settings'

/**
 * 关于我们页面的配置读取（纯函数）。
 *
 * 关于我们的文案与图片已改为数据库配置（site_settings 的 about 组 + media_assets），
 * 因此页面不再直接读前端 config，而是把 settings 解码成页面需要的形状。
 * 所有字段都有中文兜底：即使某个键尚未配置，页面也不会出现 undefined。
 */
export interface AboutContent {
  /** 欢迎语，如「欢迎您来访 大信法务」。 */
  welcome: string
  /** 公司主体名称。 */
  heroTitle: string
  /** 团队介绍标题。 */
  teamTitle: string
  /** 团队介绍段落（JSON 数组）。 */
  teamParagraphs: string[]
  /** 联系引导标题。 */
  contactTitle: string
  /** 首屏右侧配图（旧站为法庭天平图），取 about_hero_image 数组首项。 */
  heroImage: string
  /** 成功案例区块标题。 */
  successTitle: string
  /** 成功案例图片（旧站该区块为图片，不是文章卡片列表）。 */
  successImages: string[]
  /** 企业宣讲标题。 */
  lectureTitle: string
  /** 企业宣讲图片（media 地址数组）。 */
  lectureImages: string[]
  /** 我们的小伙伴标题。 */
  partnerTitle: string
  /** 合作伙伴图片（media 地址数组）。 */
  partnerImages: string[]
}

const DEFAULTS = {
  welcome: '欢迎您来访 大信法务',
  heroTitle: '深圳市大信法务咨询有限公司',
  teamTitle: '团队介绍',
  contactTitle: '如果您有任何需求和问题，24H/7 联系我们的法务团队',
  successTitle: 'TRO 成功案例',
  lectureTitle: '企业宣讲',
  partnerTitle: '我们的小伙伴',
}

/** 从 settings 里取字符串；空串按未配置处理。 */
function readText(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** 取字符串数组配置；非数组或元素非字符串时过滤掉，避免渲染出脏节点。 */
function readStringList(settings: Record<string, unknown>, key: string): string[] {
  const value = settings[key]
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      // 图片配置可能存成 { url } / { mediaUrl } 对象，取其中的地址
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const url = record.url ?? record.mediaUrl ?? record.imageUrl
        return typeof url === 'string' ? url : ''
      }
      return ''
    })
    .map((item) => item.trim())
    .filter(Boolean)
}

export function toAboutContent(settings: PublicSettings | null | undefined): AboutContent {
  const values = settings?.settings ?? {}
  const lectureImages = readStringList(values, 'about_lecture_images')
  const partnerImages = readStringList(values, 'about_partner_images')
  return {
    welcome: readText(values, 'about_hero_welcome', DEFAULTS.welcome),
    heroTitle: readText(values, 'about_hero_title', DEFAULTS.heroTitle),
    teamTitle: readText(values, 'about_team_title', DEFAULTS.teamTitle),
    teamParagraphs: readStringList(values, 'about_team_paragraphs'),
    contactTitle: readText(values, 'about_contact_title', DEFAULTS.contactTitle),
    heroImage: readStringList(values, 'about_hero_image')[0] ?? '',
    successTitle: readText(values, 'about_success_title', DEFAULTS.successTitle),
    successImages: readStringList(values, 'about_success_images'),
    lectureTitle: readText(values, 'about_lecture_title', DEFAULTS.lectureTitle),
    lectureImages,
    partnerTitle: readText(values, 'about_partner_title', DEFAULTS.partnerTitle),
    partnerImages,
  }
}
