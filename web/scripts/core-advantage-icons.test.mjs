import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const advantages = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')

test('core advantage icons use black defaults and red interactive variants', async () => {
  for (const key of ['team', 'experience', 'efficiency', 'protection']) {
    await Promise.all([
      stat(new URL(`../public/images/icons/core-${key}-black.png`, import.meta.url)),
      stat(new URL(`../public/images/icons/core-${key}-red.png`, import.meta.url))
    ])
  }
  assert.match(advantages, /core-\$\{iconKey\(item\.title\)\}-black\.png/)
  assert.match(advantages, /core-\$\{iconKey\(item\.title\)\}-red\.png/)
  assert.match(advantages, /home-core-advantages__card--expanded/)
  assert.match(advantages, /home-core-advantages__icon--red/)
  assert.match(advantages, /\.home-core-advantages__icon--red img:last-child\s*\{\s*opacity:\s*1/s)
})
