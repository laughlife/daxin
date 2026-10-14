import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const layout = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const home = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')

test('后台布局提供分组左侧导航、当前页标识与移动端抽屉', () => {
  for (const marker of [
    'admin-shell__sidebar',
    'admin-shell__group-toggle',
    'admin-shell__drawer-toggle',
    ':aria-current="isActive(link.to) ? \'page\' : undefined"',
    '/admin/settings',
    '/admin/services',
    '/admin/articles',
    '/admin/cases',
    '/admin/brands',
    '/admin/law-firms',
    '/admin/users',
  ]) {
    assert.ok(layout.includes(marker), `后台布局缺少 ${marker}`)
  }
})

test('共用后台布局移除右上方返回入口', () => {
  assert.ok(!layout.includes('返回后台首页'))
  assert.ok(!layout.includes('返回官网首页'))
})

test('后台首页不重复渲染导航卡片和用途说明', () => {
  assert.ok(!home.includes('admin-home__card-desc'))
  assert.ok(!home.includes('请选择需要管理的模块'))
  assert.ok(!home.includes('const navItems:'))
})

test('单链接导航组始终显示，避免后台首页和用户管理入口被折叠隐藏', () => {
  assert.match(layout, /v-show="group\.links\.length === 1 \|\| isExpanded\(group\)"/)
})
