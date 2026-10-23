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
  assert.match(advantages, /import swatchTeam from '~\/assets\/images\/core-advantages\/swatch-team\.png\?inline'/)
  assert.match(advantages, /const expandedSwatches: Record<string, string>/)
  assert.match(advantages, /function iconPath\(title: string, expanded: boolean\)/)
  assert.match(advantages, /:src="iconPath\(item\.title, expandedIndex === index\)"/)
  assert.match(advantages, /<p>WHY DAXIN<\/p>/)
  assert.match(advantages, /color:\s*#FFDEAB/)
  assert.match(advantages, /background-image:\s*url\('\/images\/backgrounds\/core-advantages-wave\.png'\)/)
})

test('advantages expand on hover and configured highlights use the requested gold', () => {
  assert.match(advantages, /return hoveredIndex\.value\s*$/m)
  assert.match(advantages, /const hoveredIndex = ref\(-1\)/)
  assert.match(advantages, /home-core-advantages__card--expanded/)
  assert.match(advantages, /\.home-core-advantages__emphasis\s*\{[^}]*color:\s*#EEAF4E/s)
  assert.doesNotMatch(advantages, /core-\$\{iconKey\(item\.title\)\}-(?:black|red)\.png/)
})
