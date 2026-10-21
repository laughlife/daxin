import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app/components/content/BrandDirectory.vue', import.meta.url), 'utf8')

test('brand type filters and badges use fixed blue, yellow, and green colors', () => {
  assert.match(source, /data-type='trademark'.*--brand-type-color:\s*#3183cf/s)
  assert.match(source, /data-type='patent'.*--brand-type-color:\s*#ffd400/s)
  assert.match(source, /data-type='copyright'.*--brand-type-color:\s*#4a9a63/s)
  assert.match(source, /--brand-type-soft:\s*#fffde7/)
  assert.match(source, /button\[data-type='patent'\]\.is-active\s*\{\s*color:\s*#394150;\s*\}/)
})
