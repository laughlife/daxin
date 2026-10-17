import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const homeHeroSource = await readFile(new URL('../app/components/home/HomeHero.vue', import.meta.url), 'utf8')

test('首页首屏的小字使用浅灰衬底和深色文字', () => {
  const smallTextOverlay = homeHeroSource.match(/\.home-hero__badge,\s*\.home-hero__subtitle,\s*\.home-hero__hint\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(smallTextOverlay, /background-color:\s*rgb\(/)
  assert.match(smallTextOverlay, /color:\s*#263445/)
  assert.match(smallTextOverlay, /backdrop-filter:/)
})

test('首页首屏右侧次按钮使用浅灰衬底和深色文字', () => {
  const rightButton = homeHeroSource.match(/\.home-hero \.home-hero__secondary\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(rightButton, /background-color:\s*rgb\(/)
  assert.match(rightButton, /color:\s*#263445/)
})
