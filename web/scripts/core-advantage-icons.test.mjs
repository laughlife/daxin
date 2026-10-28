import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const advantages = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')

test('core advantage uses the supplied category images and wave background', async () => {
  for (const key of ['team', 'experience', 'efficiency', 'protection']) {
    await stat(new URL(`../public/images/icons/core-advantage-${key}.png`, import.meta.url))
    await stat(new URL(`../app/assets/images/core-advantages/swatch-${key}.png`, import.meta.url))
  }
  await stat(new URL('../public/images/backgrounds/core-advantages-wave.png', import.meta.url))
  // 图片改由 props.coverImages / expandedImages 传入，默认值在 DEFAULT_*_IMAGES 常量里
  assert.match(advantages, /const DEFAULT_COVER_IMAGES = \[/)
  assert.match(advantages, /const DEFAULT_EXPANDED_IMAGES = \[/)
  assert.match(advantages, /coverImages\?: string\[\]/)
  assert.match(advantages, /function iconPath\(index: number, expanded: boolean\)/)
  assert.match(advantages, /:src="iconPath\(index, expandedIndex === index\)"/)
  assert.match(advantages, /class="home-core-advantages__heading-english">WHY DAXIN<\/p>/)
  assert.match(advantages, /font-size:\s*clamp\(1rem, 1\.7vw, 1\.4rem\)/)
  assert.match(advantages, /color:\s*#E6E6E6/)
  assert.match(advantages, /sectionBackgroundStyle/)
})

test('advantages expand on hover and configured highlights use the requested gold', () => {
  assert.match(advantages, /return hoveredIndex\.value\s*$/m)
  assert.match(advantages, /const hoveredIndex = ref\(-1\)/)
  assert.match(advantages, /home-core-advantages__card--expanded/)
  assert.match(advantages, /\.home-core-advantages__emphasis\s*\{[^}]*color:\s*#EEAF4E/s)
  assert.doesNotMatch(advantages, /core-\$\{iconKey\(item\.title\)\}-(?:black|red)\.png/)
})
