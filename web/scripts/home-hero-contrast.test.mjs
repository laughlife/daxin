import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const homeHeroSource = await readFile(new URL('../app/components/home/HomeHero.vue', import.meta.url), 'utf8')

test('首屏只在辅助提示文案上显示克制的浅灰衬底', () => {
  const badge = homeHeroSource.match(/\.home-hero__badge\s*\{[^}]*\}/s)?.[0] ?? ''
  const subtitle = homeHeroSource.match(/\.home-hero__subtitle\s*\{[^}]*\}/s)?.[0] ?? ''
  const hint = homeHeroSource.match(/\.home-hero__hint\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(badge, /color:\s*color-mix\(in srgb, var\(--color-text-inverse\) 85%, transparent\)/)
  assert.match(badge, /background-color:\s*color-mix\(in srgb, var\(--color-text-inverse\) 8%, transparent\)/)
  assert.match(subtitle, /color:\s*var\(--color-text-inverse\)/)
  assert.match(subtitle, /text-shadow:/)
  assert.match(hint, /background-color:\s*rgb\(235 239 244 \/ 66%\)/)
  assert.match(hint, /color:\s*#263445/)
  assert.doesNotMatch(homeHeroSource, /\.home-hero__badge,\s*\.home-hero__subtitle,\s*\.home-hero__hint/)
})

test('首页首屏右侧联系我们按钮使用低存在感浅灰衬底', () => {
  const rightButton = homeHeroSource.match(/\.home-hero \.home-hero__secondary\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(rightButton, /background-color:\s*rgb\(235 239 244 \/ 66%\)/)
  assert.match(rightButton, /color:\s*#263445/)
  assert.match(rightButton, /box-shadow:.*12%/)
})
