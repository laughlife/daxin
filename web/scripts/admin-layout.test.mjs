import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const layout = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const home = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')

test('后台布局提供直接菜单、当前页标识与移动端抽屉', () => {
  for (const marker of [
    'admin-shell__sidebar',
    'admin-shell__link',
    'admin-shell__drawer-toggle',
    ':aria-current="isActive(item.to) ? \'page\' : undefined"',
    '/admin/settings',
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

test('后台菜单直接显示业务入口，不包含首页、内容审核、媒体资源或分组栏', () => {
  assert.doesNotMatch(layout, /后台首页|内容审核|媒体资源|工作台|站点内容|账号管理/)
  assert.doesNotMatch(layout, /admin-shell__group-toggle|admin-shell__group-label/)
  assert.doesNotMatch(layout, /团队业务范围|\/admin\/services/)
  const settingsIndex = layout.indexOf("{ label: '站点设置'")
  assert.ok(settingsIndex > layout.indexOf("{ label: '用户与权限'"), '站点设置应位于菜单最后')
  assert.match(layout, /文章管理.*\/admin\/articles/)
  assert.match(home, /navigateTo\('\/admin\/cases'/)
})

test('Logo 同层横排显示账号、角色与退出按钮，后台布局不出现后台管理标题', () => {
  for (const marker of ['admin-shell__topbar', 'user.username', 'user.displayName', 'roleLabels', '退出登录']) {
    assert.ok(layout.includes(marker), `顶部账号栏缺少 ${marker}`)
  }
  assert.doesNotMatch(layout, />后台管理</)
  assert.doesNotMatch(home, /后台管理/)
})
