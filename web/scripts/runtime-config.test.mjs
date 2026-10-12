import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const config = await readFile(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
const settingsPage = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const adminHomePage = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')
const usersPage = await readFile(new URL('../app/pages/admin/users.vue', import.meta.url), 'utf8')

test('依赖数据库的页面不进入 Nuxt 生产预渲染清单', () => {
  const dynamicRoutes = ['/', '/about', '/tro/cases', '/brands', '/law-firms']
  const routesBlock = config.match(/routes:\s*\[(?<routes>[\s\S]*?)\]/)?.groups?.routes ?? ''
  for (const route of dynamicRoutes) {
    assert.doesNotMatch(routesBlock, new RegExp(`['\"]${route.replace('/', '\\/')}['\"]`), `${route} 必须运行时读取数据库`)
  }
})

test('保留隐私、免责声明等不依赖数据库的静态页面预渲染', () => {
  const routesBlock = config.match(/routes:\s*\[(?<routes>[\s\S]*?)\]/)?.groups?.routes ?? ''
  assert.match(routesBlock, /['\"]\/privacy['\"]/)
  assert.match(routesBlock, /['\"]\/disclaimer['\"]/)
  assert.match(routesBlock, /['\"]\/infringement-check['\"]/)
})

test('后台站点设置不再展示首页 Banner 配置项', () => {
  assert.match(settingsPage, /kind === 'home'[\s\S]*?filter\(/, '首页配置应在进入编辑态前过滤已移除项')
  assert.match(settingsPage, /home_banner_image/, '过滤逻辑应明确覆盖 home_banner_image')
})

test('后台图片管理模块已从导航和页面中移除', async () => {
  assert.doesNotMatch(adminHomePage, /\/admin\/images|图片管理/)
  await assert.rejects(
    access(new URL('../app/pages/admin/images.vue', import.meta.url)),
    '图片管理页面文件不应继续保留'
  )
})

test('站点设置不再提供 SEO 标签页', () => {
  assert.doesNotMatch(settingsPage, /kind:\s*['\"]seo['\"]/, '站点设置不应再注册 SEO 标签页')
  assert.doesNotMatch(settingsPage, /admin-settings-seo|refreshSeo|seoError/, '站点设置不应再加载 SEO 编辑面板')
})

test('后台导航开放用户与权限模块且仅限管理员', () => {
  assert.match(adminHomePage, /label: ['\"]用户与权限['\"]/)
  assert.match(adminHomePage, /to: ['\"]\/admin\/users['\"][\s\S]*?roles: \[['\"]admin['\"]\]/)
})

test('用户管理页面接入账号 CRUD 且不包含邮箱字段', () => {
  assert.match(usersPage, /\/api\/admin\/users/)
  assert.match(usersPage, /method:\s*['\"]POST['\"]/)
  assert.match(usersPage, /method:\s*['\"]PUT['\"]/)
  assert.match(usersPage, /method:\s*['\"]DELETE['\"]/)
  assert.match(usersPage, /admin[\s\S]*editor[\s\S]*viewer/)
  assert.match(usersPage, /active[\s\S]*disabled/)
  assert.doesNotMatch(usersPage, /AdminPlaceholder|email/i)
})
