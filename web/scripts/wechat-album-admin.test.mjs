import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const layout = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const middleware = await readFile(new URL('../app/middleware/admin.ts', import.meta.url), 'utf8')
const adminHome = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')
const apiGuard = await readFile(new URL('../server/middleware/disable-article-management.ts', import.meta.url), 'utf8')

test('后台不再显示文章管理，旧入口跳转到案件管理，后台默认打开案件管理', () => {
  assert.doesNotMatch(layout, /文章管理|to:\s*'\/admin\/articles'/)
  assert.match(middleware, /to\.path === '\/admin\/articles' \|\| to\.path\.startsWith\('\/admin\/articles\/'\)/)
  assert.match(middleware, /navigateTo\('\/admin\/cases', \{ replace: true \}\)/)
  assert.match(adminHome, /navigateTo\('\/admin\/cases', \{ replace: true \}\)/)
  assert.match(apiGuard, /\/api\/admin\/articles/)
  assert.match(apiGuard, /\/api\/admin\/article-categories/)
  assert.match(apiGuard, /setResponseStatus\(event, 410\)/)
})
