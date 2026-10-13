import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sidebarSource = await readFile(new URL('../app/components/layout/ContentSidebar.vue', import.meta.url), 'utf8')
const footerSource = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const qrSource = await readFile(new URL('../app/components/contact/ContactQrGrid.vue', import.meta.url), 'utf8')

test('content sidebar keeps contact and FAQ but removes recommended reading', () => {
  assert.doesNotMatch(sidebarSource, /fetchArticles/)
  assert.doesNotMatch(sidebarSource, /推荐阅读/)
  assert.match(sidebarSource, /常见问题/)
})

test('footer uses configurable intro and independent QR source overrides', () => {
  assert.match(footerSource, /footer_intro/)
  assert.match(footerSource, /footer_qr_primary/)
  assert.match(footerSource, /footer_qr_secondary/)
  assert.match(footerSource, /qrSources/)
  assert.match(qrSource, /sources\?: Record<string, string>/)
  assert.match(qrSource, /qrSource\(channel\.id, channel\.qrSrc\)/)
})
