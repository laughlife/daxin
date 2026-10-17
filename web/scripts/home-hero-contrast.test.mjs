import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const homeHeroSource = await readFile(new URL('../app/components/home/HomeHero.vue', import.meta.url), 'utf8')

test('首页首屏的小字在背景图上使用高对比文字与阴影', () => {
  assert.match(homeHeroSource, /\.home-hero__subtitle\s*\{[^}]*color:\s*var\(--color-text-inverse\)/s)
  assert.match(homeHeroSource, /\.home-hero__subtitle\s*\{[^}]*text-shadow:/s)
  assert.match(homeHeroSource, /\.home-hero__hint\s*\{[^}]*color:\s*var\(--color-text-inverse\)/s)
  assert.match(homeHeroSource, /\.home-hero__hint\s*\{[^}]*text-shadow:/s)
})
