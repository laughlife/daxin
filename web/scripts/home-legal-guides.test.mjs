import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const guidesSource = await readFile(new URL('../app/components/home/HomeLegalGuides.vue', import.meta.url), 'utf8')
const contentSettingsSource = await readFile(new URL('../app/utils/contentSettings.ts', import.meta.url), 'utf8')

test('homepage places the three-book legal guide carousel below core advantages', () => {
  const advantagesPosition = indexSource.indexOf('<HomeCoreAdvantages')
  const guidesPosition = indexSource.indexOf('<HomeLegalGuides')
  const articlesPosition = indexSource.indexOf('<ArticlePreviewSection')

  assert.ok(advantagesPosition >= 0 && guidesPosition > advantagesPosition && articlesPosition > guidesPosition)
})

test('carousel reads editable slides and QR images from shared public settings', async () => {
  assert.match(guidesSource, /useSiteSettings\(/)
  assert.match(guidesSource, /normalizeLegalGuideSlides\(/)
  assert.match(guidesSource, /home_legal_guides/)
  assert.match(guidesSource, /footer\.qr/)
  assert.match(guidesSource, /qrImageForItemKey/)
  assert.match(guidesSource, /qrItemKey/)
  assert.match(guidesSource, /:style="[^"]*guide-accent|:style="guideStyle/)
  assert.match(guidesSource, /activeSlide\.(title|paragraphs|image|benefit|accent)/)
  assert.match(guidesSource, /setInterval\([\s\S]*?5000\s*\)/)
  assert.match(guidesSource, /onBeforeUnmount/)
  assert.match(guidesSource, /v-for="\(slide, index\) in slides"/)
  assert.doesNotMatch(guidesSource, /aria-label="上一本"|aria-label="下一本"|@click="moveGuide/)
  assert.match(guidesSource, /`home-legal-guides__panel--\$\{activeSlide\.slug\}`/)
  assert.match(guidesSource, /--guide-accent/)
  assert.match(guidesSource, /home-legal-guides__offer\s*\{[^}]*align-items:\s*center/s)
  assert.match(contentSettingsSource, /title: '《破解TRO跨境难题》'/)
  assert.match(contentSettingsSource, /历年TRO侵权案例集锦/)
  assert.match(contentSettingsSource, /title: '《懂法用工，规避风险》'/)
  assert.match(contentSettingsSource, /免费领取《88项用工风险自查表》/)
  assert.match(contentSettingsSource, /国际物流/)
  assert.match(contentSettingsSource, /跨境困局：被美国律所起诉、店铺被锁、资金冻结、链接强制下架/)
  assert.match(contentSettingsSource, /员工法律意识提升后离职时集中仲裁/)
  await access(new URL('../public/images/guides/tro.png', import.meta.url))
  await access(new URL('../public/images/guides/labor-law.png', import.meta.url))
})
