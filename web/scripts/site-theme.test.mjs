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
  })
})

test('site theme normalizes custom HEX values and falls back safely for invalid values', () => {
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#aBc123' }), {
    preset: 'custom',
    primary: '#ABC123',
  })
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#12345g' }), {
    preset: 'classic-red',
    primary: '#B91C1C',
  })
  assert.deepEqual(normalizeSiteTheme({ preset: 'custom', primary: '#12345' }), {
    preset: 'classic-red',
    primary: '#B91C1C',
  })
  assert.deepEqual(normalizeSiteTheme({ preset: 'unknown', primary: '#123456' }), {
    preset: 'classic-red',
    primary: '#B91C1C',
  })
  assert.deepEqual(normalizeSiteTheme(null), {
    preset: 'classic-red',
    primary: '#B91C1C',
  })
})

test('site theme exposes only controlled primary and accent CSS variables', () => {
  assert.deepEqual(siteThemeCssVariables({ preset: 'business-purple' }), {
    '--color-primary': '#642A86',
    '--color-accent': '#D7B5E8',
  })
  assert.deepEqual(siteThemeCssVariables({ preset: 'custom', primary: '#0a2b4c' }), {
    '--color-primary': '#0A2B4C',
    '--color-accent': '#C9A45C',
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
  assert.match(publicLayoutSource, /class="site-shell"\s+:style="siteThemeStyle"/)
  assert.match(publicLayoutSource, /--color-primary-dark:\s*color-mix/)
  assert.match(publicLayoutSource, /--color-primary-light:\s*color-mix/)
  assert.doesNotMatch(adminLayoutSource, /siteThemeCssVariables|site_theme/)
})
