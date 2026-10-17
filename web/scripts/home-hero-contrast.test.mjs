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

test('首屏标题按参考图分别呈现蓝白与金色发光文字', () => {
  assert.match(homeHeroSource, /const titleHighlight = ['"]法律无忧['"]\s*;?/)
  assert.match(homeHeroSource, /class="home-hero__title-prefix"/)
  assert.match(homeHeroSource, /class="home-hero__title-highlight"/)
  const prefix = homeHeroSource.match(/\.home-hero__title-prefix\s*\{[^}]*\}/s)?.[0] ?? ''
  const highlight = homeHeroSource.match(/\.home-hero__title-highlight\s*\{[^}]*\}/s)?.[0] ?? ''
  const title = homeHeroSource.match(/\.home-hero__title\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(prefix, /color:\s*var\(--color-text-inverse\)/)
  assert.match(prefix, /text-shadow:[^}]*rgba?\([^}]*\)/s)
  assert.match(highlight, /background-image:\s*linear-gradient\(/)
  assert.match(highlight, /background-clip:\s*text/)
  assert.match(highlight, /-webkit-text-fill-color:\s*transparent/)
  assert.match(highlight, /-webkit-text-stroke:/)
  assert.match(highlight, /text-shadow:/)
  const gradient = highlight.match(/background-image:\s*linear-gradient\(([^;]+)\);/s)?.[1] ?? ''
  const metallicStops = ['#f4d6a0', '#b9702c', '#fff1ce', '#fffdf5', '#c77a2c', '#f2d5a0']
  const stopPositions = metallicStops.map(color => gradient.indexOf(color))
  assert.ok(stopPositions.every(position => position >= 0), '渐变应包含香槟金、琥珀金与奶油白色阶')
  assert.deepEqual(stopPositions, [...stopPositions].sort((a, b) => a - b), '金属色阶应按香槟金→琥珀金→奶油白→琥珀金→香槟金排列')
  assert.match(title, /font-style:\s*italic/)
})

test('首页首屏副标题在桌面宽度保持单行', () => {
  const subtitle = homeHeroSource.match(/\.home-hero__subtitle\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(subtitle, /white-space:\s*nowrap/)
})
