import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const homeHeroSource = await readFile(new URL('../app/components/home/HomeHero.vue', import.meta.url), 'utf8')
const homeContentSource = await readFile(new URL('../app/config/homeContent.ts', import.meta.url), 'utf8')
const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const seedSource = await readFile(new URL('../../tools/seed-site-config.mjs', import.meta.url), 'utf8')
const migrationSource = await readFile(new URL('../../database/migrations/020_home_hero_title_image.sql', import.meta.url), 'utf8')

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

test('首页首屏标题使用指定效果图而不是重新绘制文字', async () => {
  assert.match(homeContentSource, /titleImage:\s*['"]\/images\/home-hero-title\.png['"]?/)
  assert.match(indexSource, /titleImage:\s*readSettingText\('home_hero_title'\)/)
  assert.match(homeHeroSource, /<img[^>]+:src="text\.titleImage"[^>]+alt="跨境有我，法律无忧"/s)
  assert.match(homeHeroSource, /\.home-hero__title\s*\{[^}]*width:\s*min\(760px,\s*100%\)[^}]*aspect-ratio:\s*67\s*\/\s*10[^}]*overflow:\s*hidden/s)
  assert.match(homeHeroSource, /\.home-hero__title-image\s*\{[^}]*object-fit:\s*cover/s)
  await access(new URL('../public/images/home-hero-title.png', import.meta.url))
})

test('后台把首屏标题配置为预览图片并继续使用图片上传控件', () => {
  assert.match(settingsSource, /home_hero_title:\s*'首屏标题图片'/)
  assert.ok(settingsSource.includes("item?.mediaUrl || item?.value || ''"))
  assert.match(settingsSource, /item\.valueType === 'image'[\s\S]*?<SettingImageField[\s\S]*?:preview-size="item\.key === 'home_hero_title' \? 'wide' : 'default'"/)
  assert.match(seedSource, /key:\s*'home_hero_title',[^\n]+value:\s*'\/images\/home-hero-title\.png',[^\n]+valueType:\s*'image'/)
  assert.match(migrationSource, /setting_value\s*=\s*'\/images\/home-hero-title\.png'/i)
  assert.match(migrationSource, /value_type\s*=\s*'image'/i)
  assert.match(migrationSource, /media_id\s*=\s*NULL/i)
  assert.match(migrationSource, /WHERE\s+setting_key\s*=\s*'home_hero_title'\s+AND\s+is_current\s*=\s*1/i)
})

test('首页首屏副标题在桌面宽度保持单行', () => {
  const subtitle = homeHeroSource.match(/\.home-hero__subtitle\s*\{[^}]*\}/s)?.[0] ?? ''
  assert.match(subtitle, /white-space:\s*nowrap/)
})
