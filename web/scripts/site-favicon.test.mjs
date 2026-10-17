import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../app/app.vue', import.meta.url), 'utf8')

test('全站网页图标使用后台配置的站点 Logo', () => {
  assert.match(appSource, /useSiteSettings\(\)/)
  assert.match(appSource, /settings\?\.site_logo/)
  assert.match(appSource, /rel:\s*['"]icon['"]/)
  assert.match(appSource, /href:\s*logoFavicon/)
})
