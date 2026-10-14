import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  normalizeContentSidebar,
  normalizeLegalGuideSlides,
  sidebarQrIds,
} from '../app/utils/contentSettings.ts'

const migration = await readFile(new URL('../../database/migrations/013_sidebar_and_legal_guides_settings.sql', import.meta.url), 'utf8')
const featureMigration = await readFile(new URL('../../database/migrations/015_home_carousel_site_theme.sql', import.meta.url), 'utf8')

test('content sidebar merges editable copy while locking FAQ destinations to safe internal routes', () => {
  const result = normalizeContentSidebar({
    faqTitle: '问题导航',
    publicHeading: '公众号咨询',
    consultHeading: '添加顾问',
    faqLinks: [
      { key: 'labor', label: '劳动问答', path: 'https://outside.example', enabled: true, sortOrder: 10 },
      { key: 'tro', label: 'TRO问答', path: '/faq/tro', enabled: false, sortOrder: 20 },
      { key: 'unknown', label: '危险链接', path: '//outside.example', enabled: true, sortOrder: 30 },
    ],
  })

  assert.equal(result.faqTitle, '问题导航')
  assert.equal(result.publicHeading, '公众号咨询')
  assert.equal(result.consultHeading, '添加顾问')
  assert.deepEqual(result.faqLinks, [
    { key: 'labor', label: '劳动问答', path: '/faq/labor', enabled: true, sortOrder: 10 },
    { key: 'tro', label: 'TRO问答', path: '/faq/tro', enabled: false, sortOrder: 20 },
    { key: 'cross-border', label: '跨境干货', path: '/faq/cross-border', enabled: true, sortOrder: 30 },
  ])
})

test('invalid sidebar values return independent copies of the safe defaults', () => {
  const first = normalizeContentSidebar(null)
  const second = normalizeContentSidebar({ faqLinks: 'not-an-array' })

  assert.equal(first.faqTitle, '常见问题')
  assert.deepEqual(first.faqLinks.map(link => link.path), ['/faq/tro', '/faq/labor', '/faq/cross-border'])
  assert.deepEqual(second, first)
  first.faqLinks[0].label = 'mutated'
  assert.equal(second.faqLinks[0].label, 'TRO 常见问题')
})

test('sidebar QR IDs match the existing public account settings and consultation asset keys', () => {
  assert.deepEqual(sidebarQrIds('tro'), ['tro-public', 'tro-consult'])
  assert.deepEqual(sidebarQrIds('labor'), ['labor-public', 'labor-consult'])
  assert.deepEqual(sidebarQrIds('all'), ['tro-public', 'tro-consult'])
})

test('legal guide settings preserve three fixed themes and merge editable copy with defaults', () => {
  const partial = [
    { slug: 'logistics', title: '物流维权', paragraphs: ['物流合同风险'], accent: '#2177aa' },
    { slug: 'tro', title: 'TRO新标题', paragraphs: ['更新后的 TRO 内容'] },
    { slug: 'labor', image: 'https://cdn.example.test/labor.png' },
  ]
  const result = normalizeLegalGuideSlides(partial)

  assert.deepEqual(result.map(slide => slide.slug), ['tro', 'labor', 'logistics'])
  assert.equal(result[0].title, 'TRO新标题')
  assert.deepEqual(result[0].paragraphs, ['更新后的 TRO 内容'])
  assert.equal(result[0].image, '/images/guides/tro.png')
  assert.equal(result[1].title, '《懂法用工，规避风险》')
  assert.equal(result[1].image, 'https://cdn.example.test/labor.png')
  assert.equal(result[2].accent, '#2177aa')
  assert.equal(result[2].qrItemKey, 'qr-tro-consult')
})

test('three legal guide slides accept the same four QR assets and an explicit empty choice', () => {
  const keys = ['qr-tro-public', 'qr-tro-consult', 'qr-labor-public', 'qr-labor-consult', '']
  const result = normalizeLegalGuideSlides([
    { slug: 'tro', qrItemKey: 'qr-labor-public' },
    { slug: 'labor', qrItemKey: 'qr-tro-public' },
    { slug: 'logistics', qrItemKey: keys[0] },
  ])
  assert.equal(result[0].qrItemKey, 'qr-labor-public')
  assert.equal(result[1].qrItemKey, 'qr-tro-public')
  assert.equal(result[2].qrItemKey, 'qr-tro-public')

  const optedOut = normalizeLegalGuideSlides([
    { slug: 'tro', qrItemKey: '' },
    { slug: 'labor', qrItemKey: '' },
    { slug: 'logistics', qrItemKey: '' },
  ])
  assert.equal(optedOut[0].qrItemKey, '')
  assert.equal(optedOut[1].qrItemKey, '')
  assert.equal(optedOut[2].qrItemKey, '')

  const invalid = normalizeLegalGuideSlides([
    { slug: 'tro', qrItemKey: 'https://example.test/qr.png' },
    { slug: 'labor', qrItemKey: 'https://example.test/qr.png' },
    { slug: 'logistics', qrItemKey: 'https://example.test/qr.png' },
  ])
  assert.equal(invalid[0].qrItemKey, 'qr-tro-consult')
  assert.equal(invalid[1].qrItemKey, 'qr-labor-consult')
  assert.equal(invalid[2].qrItemKey, 'qr-tro-consult')
})

test('legal guide settings preserve every paragraph added in the admin editor', () => {
  const paragraphs = Array.from({ length: 9 }, (_, index) => `正文第${index + 1}段`)
  const result = normalizeLegalGuideSlides([
    { slug: 'tro', paragraphs },
    { slug: 'labor' },
    { slug: 'logistics' },
  ])

  assert.deepEqual(result[0].paragraphs, paragraphs)
})

test('invalid or incomplete legal guide arrays fall back to all original themes', () => {
  const defaults = normalizeLegalGuideSlides(undefined)

  assert.deepEqual(defaults.map(slide => slide.slug), ['tro', 'labor', 'logistics'])
  assert.equal(defaults[0].title, '《破解TRO跨境难题》')
  assert.equal(defaults[1].benefit, '免费领取《88项用工风险自查表》')
  assert.deepEqual(normalizeLegalGuideSlides([{ slug: 'tro', title: 'Only one' }]), defaults)
  assert.deepEqual(normalizeLegalGuideSlides([{ slug: 'tro' }, { slug: 'labor' }, { slug: 'bad' }]), defaults)
})

test('migration seeds both JSON settings without replacing current admin values', () => {
  assert.match(migration, /'content_sidebar',\s*'general'/)
  assert.match(migration, /'home_legal_guides',\s*'home'/)
  assert.equal((migration.match(/'json'/g) ?? []).length, 2)
  assert.equal((migration.match(/WHERE NOT EXISTS\s*\(SELECT 1 FROM site_settings WHERE setting_key =/g) ?? []).length, 2)
  assert.match(migration, /常见问题/)
  assert.match(migration, /qr-tro-consult/)
  assert.match(migration, /qr-labor-consult/)
  assert.match(migration, /破解TRO跨境难题/)
  assert.match(migration, /88项用工风险自查表/)
})

test('015 migration seeds site theme and only fills an empty logistics QR default', () => {
  assert.match(featureMigration, /^-- @data-migration/m)
  assert.match(featureMigration, /'site_theme',\s*'general'/)
  assert.match(featureMigration, /classic-red/)
  assert.match(featureMigration, /qr-tro-consult/)
  assert.match(featureMigration, /JSON_SET/)
  assert.match(featureMigration, /WHERE NOT EXISTS\s*\(\s*SELECT 1 FROM site_settings WHERE setting_key = 'site_theme'/)
  assert.match(featureMigration, /qrItemKey/)
})
