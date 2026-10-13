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

test('legal guide carousel has three distinct books, working rotation controls, and the supplied covers', async () => {
  assert.equal((guidesSource.match(/slug: '/g) ?? []).length, 3)
  assert.match(guidesSource, /普法干货/)
  assert.match(guidesSource, /第\s*\{\{\s*currentIndex\s*\+\s*1\s*\}\}\s*\/\s*\{\{\s*guideBooks\.length/)
  assert.match(guidesSource, /aria-label="上一本"/)
  assert.match(guidesSource, /aria-label="下一本"/)
  assert.match(guidesSource, /\/images\/guides\/tro\.png/)
  assert.match(guidesSource, /\/images\/guides\/labor-law\.png/)
  assert.match(guidesSource, /\/images\/services\/service-dispute\.png/)
  await access(new URL('../public/images/guides/tro.png', import.meta.url))
  await access(new URL('../public/images/guides/labor-law.png', import.meta.url))
})
