import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const aboutSource = await readFile(new URL('../app/pages/about.vue', import.meta.url), 'utf8')
const aboutContentSource = await readFile(new URL('../app/utils/aboutContent.ts', import.meta.url), 'utf8')

test('homepage removes the old core business/sidebar/image structure and uses the short about link', () => {
  assert.doesNotMatch(indexSource, /<BusinessSection\s*\/>/)
  assert.doesNotMatch(indexSource, /<ContentColumns>/)
  assert.doesNotMatch(indexSource, /homeRightImage/)
  assert.match(indexSource, /了解更多/)
  assert.doesNotMatch(indexSource, /了解更多关于我们/)
  assert.match(indexSource, /HomeCoreAdvantages/)
})

test('about page no longer renders retired hero paragraph or business image section', () => {
  assert.doesNotMatch(aboutSource, /about\.heroParagraph/)
  assert.doesNotMatch(aboutSource, /about\.businessImages/)
  assert.doesNotMatch(aboutContentSource, /heroParagraph:/)
  assert.doesNotMatch(aboutContentSource, /businessImages:/)
})
