import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const layout = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const middleware = await readFile(new URL('../app/middleware/admin.ts', import.meta.url), 'utf8')
const adminHome = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')

test('后台重新开放文章管理，并保留后台默认案件入口', async () => {
  assert.match(layout, /文章管理.*\/admin\/articles/)
  assert.match(middleware, /prefix: '\/admin\/articles', roles: \['admin', 'editor', 'viewer'\]/)
  assert.doesNotMatch(middleware, /公众号文章改为由定时任务维护/)
  assert.match(adminHome, /navigateTo\('\/admin\/cases', \{ replace: true \}\)/)
  await assert.rejects(access(new URL('../server/middleware/disable-article-management.ts', import.meta.url)))
})
