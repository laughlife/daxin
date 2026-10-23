import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  normalizeSiteTheme,
  SITE_THEME_PRESETS,
  siteThemeCssVariables,
} from '../app/utils/siteTheme.ts'

const adminSettingsSource = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const publicLayoutSource = await readFile(new URL('../app/layouts/default.vue', import.meta.url), 'utf8')
const adminLayoutSource = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')

test('site theme presets use the approved brand palettes', () => {
  assert.deepEqual(SITE_THEME_PRESETS, {
    'classic-red': { label: '大信经典红', primary: '#B91C1C', accent: '#C9A45C' },
    'legal-navy': { label: '律政藏蓝', primary: '#244A73', accent: '#C9A45C' },
    'elegant-green': { label: '雅致墨绿', primary: '#28675A', accent: '#C9A45C' },
    'business-purple': { label: '商务紫', primary: '#642A86', accent: '#D7B5E8' },
    // 需求 2026-10-20：金色系作为品牌主推预设，额外覆盖底色与文字色
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
  })
})

test('site theme normalizes custom HEX values and falls back safely for invalid values', () => {
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#aBc123' }), {
    preset: 'custom',
    primary: '#ABC123',
  })
  // 非法/未知/缺失一律回落到「品牌主推」预设（2026-10-20 起为典雅金）
  const fallback = { preset: 'royal-gold', primary: '#8F5F18' }
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#12345g' }), fallback)
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#12345' }), fallback)
  assert.deepEqual(normalizeSiteTheme({ preset: 'unknown', primary: '#123456' }), fallback)
  assert.deepEqual(normalizeSiteTheme(null), fallback)
})

test('site theme selects the matching wave background for each palette', () => {
  assert.deepEqual(siteThemeCssVariables({ preset: 'business-purple' }), {
    '--color-primary': '#642A86',
    '--color-accent': '#D7B5E8',
    '--site-background-image': "url('/images/backgrounds/site-background-neutral.png')",
  })
  assert.deepEqual(siteThemeCssVariables({ preset: 'custom', primary: '#0a2b4c' }), {
    '--color-primary': '#0A2B4C',
    '--color-accent': '#C9A45C',
    '--site-background-image': "url('/images/backgrounds/site-background-neutral.png')",
  })
})

test('gold preset overrides surface and text colors so the palette is coherent', () => {
  // 只换主色会让「主色是金的、底子还是冷灰」，因此金色预设必须同时覆盖底色与文字色
  assert.deepEqual(siteThemeCssVariables({ preset: 'royal-gold' }), {
    '--color-primary': '#8F5F18',
    '--color-accent': '#D4AF37',
    '--color-primary-dark': '#7A5216',
    '--color-primary-light': '#F7EEDA',
    '--color-bg-light': '#FAF6EE',
    '--color-bg-dark': '#2A2018',
    '--color-text': '#2B2620',
    '--color-text-muted': '#6F6559',
    '--site-background-image': "url('/images/backgrounds/site-background-warm.png')",
  })
})

test('admin settings edits site_theme as structured data and blocks invalid custom colors', () => {
  assert.match(adminSettingsSource, /isValidSiteThemeHex\(/)
  assert.match(adminSettingsSource, /item\.key === 'site_theme'/)
  assert.match(adminSettingsSource, /JSON\.stringify\(siteTheme\.value\)/)
  assert.match(adminSettingsSource, /SITE_THEME_PRESETS/)
  assert.match(adminSettingsSource, /v-for="\(preset, key\) in SITE_THEME_PRESETS"/)
  assert.match(adminSettingsSource, /type="color"/)
  assert.match(adminSettingsSource, /#RRGGBB/)
})

test('public layout applies normalized theme tokens while admin keeps its own theme', () => {
  assert.match(publicLayoutSource, /useSiteSettings\(/)
  assert.match(publicLayoutSource, /siteThemeCssVariables\(/)
  assert.match(publicLayoutSource, /class="site-shell"\s+:class="\{[^}]*site-shell--interior[^}]*\}"\s+:style="siteThemeStyle"/)
  assert.match(publicLayoutSource, /route\.path === '\/'/)
  assert.match(publicLayoutSource, /'--color-bg-light': '#fff'/)
  assert.match(publicLayoutSource, /'--site-background-image': 'none'/)
  assert.match(publicLayoutSource, /--color-primary-dark:\s*color-mix/)
  assert.match(publicLayoutSource, /--color-primary-light:\s*color-mix/)
  assert.match(publicLayoutSource, /background-image:\s*var\(--site-background-image\)/)
  assert.doesNotMatch(adminLayoutSource, /siteThemeCssVariables|site_theme/)
})
