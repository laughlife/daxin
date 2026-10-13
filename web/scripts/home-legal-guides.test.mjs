import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const guidesSource = await readFile(new URL('../app/components/home/HomeLegalGuides.vue', import.meta.url), 'utf8')

test('homepage places the three-book legal guide carousel below core advantages', () => {
  const advantagesPosition = indexSource.indexOf('<HomeCoreAdvantages')
  const guidesPosition = indexSource.indexOf('<HomeLegalGuides')
  const articlesPosition = indexSource.indexOf('<ArticlePreviewSection')

  assert.ok(advantagesPosition >= 0 && guidesPosition > advantagesPosition && articlesPosition > guidesPosition)
})

test('legal guide carousel auto-rotates three supplied topics every five seconds without click-switch controls', async () => {
  assert.equal((guidesSource.match(/slug: '(?:tro|labor|logistics)',/g) ?? []).length, 3)
  assert.match(guidesSource, /普法干货/)
  assert.match(guidesSource, /setInterval\([\s\S]*?5000\s*\)/)
  assert.match(guidesSource, /onBeforeUnmount/)
  assert.doesNotMatch(guidesSource, /aria-label="上一本"|aria-label="下一本"|@click="moveGuide/)
  assert.match(guidesSource, /破解TRO跨境难题/)
  assert.match(guidesSource, /历年TRO侵权案例集锦/)
  assert.match(guidesSource, /懂法用工，规避风险/)
  assert.match(guidesSource, /免费领取《88项用工风险自查表》/)
  assert.match(guidesSource, /国际物流/)
  assert.match(guidesSource, /home-legal-guides__panel--tro/)
  assert.match(guidesSource, /home-legal-guides__panel--labor/)
  assert.match(guidesSource, /home-legal-guides__panel--logistics/)
  assert.match(guidesSource, /images\/qr\/tro-consult\.png/)
  assert.match(guidesSource, /images\/qr\/labor-consult\.png/)
  assert.match(guidesSource, /\/images\/guides\/tro\.png/)
  assert.match(guidesSource, /\/images\/guides\/labor-law\.png/)
  assert.match(guidesSource, /跨境困局：被美国律所起诉、店铺被锁、资金冻结、链接强制下架/)
  assert.match(guidesSource, /员工法律意识提升后离职时集中仲裁/)
  await access(new URL('../public/images/guides/tro.png', import.meta.url))
  await access(new URL('../public/images/guides/labor-law.png', import.meta.url))
})
