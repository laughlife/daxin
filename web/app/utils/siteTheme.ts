export type SiteThemePreset = 'classic-red' | 'legal-navy' | 'elegant-green' | 'business-purple' | 'royal-gold' | 'custom'

export interface SiteTheme {
  preset: SiteThemePreset
  primary: string
}

/**
 * 预设的扩展调色板。
 *
 * 为什么需要它：原来一个预设只能覆盖 `--color-primary` 与 `--color-accent` 两个变量，
 * 一旦改成金色，浅色分区底、深色底、正文色仍是红色体系留下的冷灰，
 * 页面会「主色是金的、底子还是冷色」，看起来像是没改干净。
 *
 * 现有预设不带 extended，行为与之前完全一致（只覆盖主色与点缀色），
 * 避免为了加金色预设而改掉其它预设的观感。
 */
interface SiteThemeExtendedPalette {
  primaryDark: string
  primaryLight: string
  bgLight: string
  bgDark: string
  text: string
  textMuted: string
}

interface SiteThemePresetDefinition {
  label: string
  primary: string
  accent: string
  extended?: SiteThemeExtendedPalette
}

export const SITE_THEME_PRESETS: Record<Exclude<SiteThemePreset, 'custom'>, SiteThemePresetDefinition> = {
  'classic-red': { label: '大信经典红', primary: '#B91C1C', accent: '#C9A45C' },
  'legal-navy': { label: '律政藏蓝', primary: '#244A73', accent: '#C9A45C' },
  'elegant-green': { label: '雅致墨绿', primary: '#28675A', accent: '#C9A45C' },
  'business-purple': { label: '商务紫', primary: '#642A86', accent: '#D7B5E8' },
  /*
   * 金色系（需求 2026-10-20：整体配色参考旧海报的金色 + 暖米色底）。
   *
   * 取值依据（均已核算对比度，避免「金色好看但读不清」）：
   *   primary #8F5F18 对白底 5.50:1 —— 可安全用于正文链接与按钮底色（白字）
   *   primaryDark #7A5216 对白底 6.89:1
   *   accent #D4AF37 对白底仅 2.10:1 —— 只作装饰（分隔线、图标、渐变），不做正文
   *   text #2B2620 对米白底 13.91:1；textMuted #6F6559 对米白底 5.29:1
   */
  'royal-gold': {
    label: '典雅金（品牌主推）',
    primary: '#8F5F18',
    accent: '#D4AF37',
    extended: {
      primaryDark: '#7A5216',
      primaryLight: '#F7EEDA',
      bgLight: '#FAF6EE',
      bgDark: '#2A2018',
      text: '#2B2620',
      textMuted: '#6F6559',
    },
  },
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  preset: 'royal-gold',
  primary: SITE_THEME_PRESETS['royal-gold'].primary,
}

const PRESET_KEYS = Object.keys(SITE_THEME_PRESETS) as Array<keyof typeof SITE_THEME_PRESETS>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function isValidSiteThemeHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
}

export function normalizeSiteTheme(value: unknown): SiteTheme {
  if (!isRecord(value)) return { ...DEFAULT_SITE_THEME }

  const preset = value.preset
  if (preset === 'custom') {
    if (!isValidSiteThemeHex(value.primary)) return { ...DEFAULT_SITE_THEME }
    return { preset, primary: value.primary.trim().toUpperCase() }
  }

  if (typeof preset !== 'string' || !PRESET_KEYS.includes(preset as keyof typeof SITE_THEME_PRESETS)) {
    return { ...DEFAULT_SITE_THEME }
  }

  return {
    preset: preset as keyof typeof SITE_THEME_PRESETS,
    primary: SITE_THEME_PRESETS[preset as keyof typeof SITE_THEME_PRESETS].primary,
  }
}

export function siteThemeCssVariables(value: unknown): Record<string, string> {
  const theme = normalizeSiteTheme(value)
  if (theme.preset === 'custom') {
    return {
      '--color-primary': theme.primary,
      '--color-accent': '#C9A45C',
      '--site-background-image': "url('/images/backgrounds/site-background-neutral.png')",
    }
  }

  const preset = SITE_THEME_PRESETS[theme.preset]
  const variables: Record<string, string> = {
    '--color-primary': preset.primary,
    '--color-accent': preset.accent,
    '--site-background-image': theme.preset === 'royal-gold'
      ? "url('/images/backgrounds/site-background-warm.png')"
      : "url('/images/backgrounds/site-background-neutral.png')",
  }

  // 带扩展调色板的预设额外覆盖底色与文字色，让整站配色真正统一
  if (preset.extended) {
    variables['--color-primary-dark'] = preset.extended.primaryDark
    variables['--color-primary-light'] = preset.extended.primaryLight
    variables['--color-bg-light'] = preset.extended.bgLight
    variables['--color-bg-dark'] = preset.extended.bgDark
    variables['--color-text'] = preset.extended.text
    variables['--color-text-muted'] = preset.extended.textMuted
  }

  return variables
}
