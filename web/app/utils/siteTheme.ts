export type SiteThemePreset = 'classic-red' | 'legal-navy' | 'elegant-green' | 'business-purple' | 'custom'

export interface SiteTheme {
  preset: SiteThemePreset
  primary: string
}

export const SITE_THEME_PRESETS = {
  'classic-red': { label: '大信经典红', primary: '#B91C1C', accent: '#C9A45C' },
  'legal-navy': { label: '律政藏蓝', primary: '#244A73', accent: '#C9A45C' },
  'elegant-green': { label: '雅致墨绿', primary: '#28675A', accent: '#C9A45C' },
  'business-purple': { label: '商务紫', primary: '#642A86', accent: '#D7B5E8' },
} as const

export const DEFAULT_SITE_THEME: SiteTheme = {
  preset: 'classic-red',
  primary: SITE_THEME_PRESETS['classic-red'].primary,
}

const PRESET_KEYS = Object.keys(SITE_THEME_PRESETS) as Array<keyof typeof SITE_THEME_PRESETS>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
}

export function normalizeSiteTheme(value: unknown): SiteTheme {
  if (!isRecord(value)) return { ...DEFAULT_SITE_THEME }

  const preset = value.preset
  if (preset === 'custom') {
    if (!isHexColor(value.primary)) return { ...DEFAULT_SITE_THEME }
    return { preset, primary: value.primary.trim().toUpperCase() }
  }

  if (typeof preset !== 'string' || !PRESET_KEYS.includes(preset as keyof typeof SITE_THEME_PRESETS)) {
    return { ...DEFAULT_SITE_THEME }
  }

  return {
    preset,
    primary: SITE_THEME_PRESETS[preset as keyof typeof SITE_THEME_PRESETS].primary,
  }
}

export function siteThemeCssVariables(value: unknown): Record<string, string> {
  const theme = normalizeSiteTheme(value)
  const accent = theme.preset === 'custom'
    ? '#C9A45C'
    : SITE_THEME_PRESETS[theme.preset].accent

  return {
    '--color-primary': theme.primary,
    '--color-accent': accent,
  }
}
