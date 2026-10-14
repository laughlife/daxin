import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('后台管理页不重复显示左侧菜单或选中标签对应的标题', async () => {
  const pages = await Promise.all([
    read('../app/pages/admin/settings.vue'),
    read('../app/pages/admin/articles.vue'),
    read('../app/pages/admin/cases.vue'),
    read('../app/pages/admin/users.vue'),
    read('../app/components/admin/AdminEntityManager.vue')
  ])
  for (const page of pages) assert.doesNotMatch(page, /<h1[^>]*class="[^"]*(?:settings|articles|cases|users|entity)__title"/)
  const settings = pages[0]
  const qrSettings = await read('../app/components/admin/SitePublishingSettings.vue')
  assert.doesNotMatch(settings, /<BaseCard\s+:title="tab\.label"/)
  assert.doesNotMatch(qrSettings, /<BaseCard\s+title="二维码管理"/)
})
