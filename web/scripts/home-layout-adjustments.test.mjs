import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const teamServicesSource = await readFile(new URL('../app/components/home/HomeTeamServices.vue', import.meta.url), 'utf8')
const advantagesSource = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')
const footerSource = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const qrSource = await readFile(new URL('../app/components/contact/ContactQrGrid.vue', import.meta.url), 'utf8')

test('homepage keeps the configured team intro on the left and places services in a two-by-two grid on the right', () => {
  assert.match(indexSource, /<HomeTeamServices :sections="teamServices"\s*\/>/)
  assert.match(indexSource, /home-about__layout[\s\S]*?home-about__content[\s\S]*?HomeTeamServices/)
  assert.match(indexSource, /grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/)
  assert.match(teamServicesSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.doesNotMatch(teamServicesSource, /团队业务范围/)
  assert.match(indexSource, /:title="teamTitleFromSettings"/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
})

test('core advantages omit numeric prefixes, keep a stable card height, and widen the selected card', () => {
  assert.doesNotMatch(advantagesSource, /home-core-advantages__index|0\{\{\s*index/)
  assert.match(advantagesSource, /height:\s*\d+px/)
  assert.match(advantagesSource, /gridTemplateColumns/)
  assert.match(advantagesSource, /home-core-advantages__icon/)
})

test('footer hides the public QR names while other QR surfaces can retain them', () => {
  assert.match(footerSource, /hide-name/)
  assert.match(qrSource, /hideName/)
  assert.match(qrSource, /v-if="!hideName"/)
})
