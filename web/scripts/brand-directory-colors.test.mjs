import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../app/components/content/BrandDirectory.vue', import.meta.url), 'utf8')

test('brand type filters and badges use fixed blue, green, and red colors', () => {
  assert.match(source, /data-type='trademark'.*--brand-type-color:\s*#3183cf/s)
  assert.match(source, /data-type='patent'.*--brand-type-color:\s*#10b981/s)
  assert.match(source, /data-type='copyright'.*--brand-type-color:\s*#d92d2d/s)
  assert.match(source, /--brand-type-soft:\s*#e5f7ef/)
  assert.match(source, /--brand-type-soft:\s*#fce8e8/)
  assert.match(source, /\.brand-directory__tabs button\s*\{[^}]*font-family:\s*var\(--font-family-base\);[^}]*font-weight:\s*700;/s)
  assert.match(source, /\.brand-card__types span\s*\{[^}]*font-family:\s*var\(--font-family-base\);[^}]*font-weight:\s*700;/s)
})
