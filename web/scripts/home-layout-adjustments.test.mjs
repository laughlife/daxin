import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const teamServicesSource = await readFile(new URL('../app/components/home/HomeTeamServices.vue', import.meta.url), 'utf8')
const advantagesSource = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')
const statsSource = await readFile(new URL('../app/components/home/StatsSection.vue', import.meta.url), 'utf8')
const footerSource = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const qrSource = await readFile(new URL('../app/components/contact/ContactQrGrid.vue', import.meta.url), 'utf8')

test('homepage keeps the configured team intro on the left and places services in a two-by-two grid on the right', () => {
  assert.match(indexSource, /<HomeTeamServices :sections="teamServices"\s*\/>/)
  assert.match(indexSource, /home-about__layout[\s\S]*?home-about__content[\s\S]*?HomeTeamServices/)
  assert.match(indexSource, /grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/)
  assert.match(teamServicesSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.doesNotMatch(teamServicesSource, /团队业务范围/)
  assert.match(indexSource, /:title="teamDisplayTitle"/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
})

test('team introduction centers About US and keeps the copy compact beside the service cards', () => {
  assert.match(indexSource, /<SectionHeading align="center" eyebrow="About US" :title="teamDisplayTitle"\s*\/>/)
  assert.match(indexSource, /line-height:\s*1\.55/)
  assert.match(indexSource, /teamDisplayTitle = computed/)
})

test('service cards omit redundant summaries but keep all configured items, with a subtle hover state', () => {
  assert.doesNotMatch(teamServicesSource, /section\.description/)
  assert.match(teamServicesSource, /v-for="item in section\.items"/)
  assert.doesNotMatch(teamServicesSource, /redundantItemTitles/)
  assert.match(teamServicesSource, /:hover/)
  assert.match(teamServicesSource, /scale\(1\.0\d+\)/)
})

test('all homepage metrics get a subtle selected hover state', () => {
  assert.match(statsSource, /stats-section__item:hover/)
  assert.match(statsSource, /scale\(1\.0\d+\)/)
})

test('core advantages omit numeric prefixes, keep a stable card height, and widen the selected card', () => {
  assert.doesNotMatch(advantagesSource, /home-core-advantages__index|0\{\{\s*index/)
  assert.doesNotMatch(advantagesSource, /home-core-advantages__plus/)
  assert.match(advantagesSource, /displayTitle\(item\.title\)/)
  assert.match(advantagesSource, /replace\(\/\^0\?\[1-4\]\[\.、\\s\]\+/)
  assert.match(advantagesSource, /height:\s*\d+px/)
  assert.match(advantagesSource, /gridTemplateColumns/)
  assert.match(advantagesSource, /home-core-advantages__icon/)
  assert.match(advantagesSource, /v-if="expandedIndex !== index"/)
  assert.doesNotMatch(advantagesSource, /overflow-y:\s*auto/)
  assert.match(advantagesSource, /flex-direction:\s*column/)
  assert.match(advantagesSource, /align-items:\s*center/)
})

test('footer hides the public QR names while other QR surfaces can retain them', () => {
  assert.match(footerSource, /hide-name/)
  assert.match(qrSource, /hideName/)
  assert.match(qrSource, /v-if="!hideName"/)
})
