import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sidebarSource = await readFile(new URL('../app/components/layout/ContentSidebar.vue', import.meta.url), 'utf8')
const footerSource = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const qrSource = await readFile(new URL('../app/components/contact/ContactQrGrid.vue', import.meta.url), 'utf8')

test('content sidebar keeps FAQ before the two configurable QR sections', () => {
  const faqPosition = sidebarSource.indexOf('sidebarConfig.faqTitle')
  const publicPosition = sidebarSource.indexOf('sidebarConfig.publicHeading')
  const consultPosition = sidebarSource.indexOf('sidebarConfig.consultHeading')

  assert.ok(faqPosition >= 0 && publicPosition > faqPosition && consultPosition > publicPosition)
  assert.match(sidebarSource, /normalizeContentSidebar\(/)
  assert.match(sidebarSource, /useSiteSettings\(/)
  assert.match(sidebarSource, /:hide-name="true"/)
  assert.match(sidebarSource, /:hide-note="true"/)
  assert.match(sidebarSource, /电话咨询/)
  assert.match(sidebarSource, /useSiteIdentity\(/)
  assert.match(sidebarSource, /sidebar-card__phone/)
  assert.doesNotMatch(sidebarSource, /sidebar-card__intro/)
  assert.doesNotMatch(sidebarSource, /推荐阅读/)
})

test('sidebar uses configured link labels/order and only the matching public/consult QR pair', () => {
  assert.match(sidebarSource, /sidebarConfig\.value\.faqLinks/)
  assert.match(sidebarSource, /link\.enabled/)
  assert.match(sidebarSource, /props\.group === 'labor' \? 'labor' : 'tro'/)
  assert.match(sidebarSource, /qrSourcesFromAssets/)
  assert.doesNotMatch(sidebarSource, /footer_qr_primary|footer_qr_secondary/)
  assert.match(sidebarSource, /kind="public"/)
  assert.match(sidebarSource, /kind="consult"/)
  assert.match(qrSource, /kind\?: 'all' \| 'public' \| 'consult'/)
})

test('footer keeps configurable intro and independent QR source overrides', () => {
  assert.match(footerSource, /footer_intro/)
  assert.match(footerSource, /footer_qr_primary/)
  assert.match(footerSource, /footer_qr_secondary/)
  assert.match(footerSource, /qrSources/)
  assert.match(qrSource, /sources\?: Record<string, string>/)
  assert.match(qrSource, /qrSource\(channel\.id, channel\.qrSrc\)/)
})
