import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const tokens = await readFile(new URL('../app/assets/styles/tokens.css', import.meta.url), 'utf8')
const baseStyles = await readFile(new URL('../app/assets/styles/main.css', import.meta.url), 'utf8')
const button = await readFile(new URL('../app/components/ui/BaseButton.vue', import.meta.url), 'utf8')
test('global layout tokens provide a wider canvas and responsive section breathing room', () => {
  assert.match(tokens, /--container-max-width:\s*1320px/)
  assert.match(tokens, /--container-wide-width:\s*1440px/)
  assert.match(tokens, /--space-section:\s*clamp\(72px,\s*7vw,\s*104px\)/)
  assert.match(tokens, /--space-section-compact:\s*clamp\(52px,\s*5vw,\s*72px\)/)
})

test('global typography and controls share the design token scale', () => {
  assert.match(tokens, /--font-family-base:/)
  assert.match(tokens, /--heading-1:\s*clamp\(/)
  assert.match(tokens, /--heading-2:\s*clamp\(/)
  assert.match(baseStyles, /font-family:\s*var\(--font-family-base\)/)
  assert.match(baseStyles, /input:not\(\[type=/)
  assert.match(baseStyles, /textarea/)
  assert.match(button, /border-radius:\s*var\(--radius-control\)/)
})

