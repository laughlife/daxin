import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const seedSource = await readFile(new URL('../../tools/seed-site-config.mjs', import.meta.url), 'utf8')
const migrationSource = await readFile(new URL('../../database/migrations/035_home_service_images.sql', import.meta.url), 'utf8')

test('homepage removes the old hero module and uses team introduction as its first section', () => {
  assert.doesNotMatch(indexSource, /<HomeHero|home_hero_/)
  assert.match(indexSource, /<section class="home-team-intro"/)
  assert.match(indexSource, /<h1 class="home-team-intro__title">\{\{ teamDisplayTitle \}\}/)
  assert.match(indexSource, /:src="teamBackgroundImage"/)
  assert.match(indexSource, /查询 TRO 案件/)
  assert.match(indexSource, /联系我们免费评估案件/)
  assert.doesNotMatch(indexSource, /了解更多/)
})

test('old hero settings are removed from the admin and seed config and archived by migration', () => {
  assert.doesNotMatch(settingsSource, /home_hero_badge:\s*'首屏眉题'/)
  assert.match(settingsSource, /'home_hero_badge',\s*'home_hero_title'/)
  assert.doesNotMatch(seedSource, /key:\s*'home_hero_/) 
  assert.match(migrationSource, /ADD COLUMN image_media_id BIGINT UNSIGNED NULL/i)
  assert.match(migrationSource, /status = 'archived'/i)
  assert.match(migrationSource, /'home_banner_image'/)
})

test('site seed retains all five core business panels, including lifecycle support', async () => {
  const seedSource = await readFile(new URL('../../tools/seed-site-config.mjs', import.meta.url), 'utf8')
  for (const value of ['team-lifecycle', '全周期法律护航', 'lifecycle-review', 'lifecycle-optimize', 'lifecycle-visualize']) {
    assert.ok(seedSource.includes(value), `种子配置缺少 ${value}`)
  }
})
