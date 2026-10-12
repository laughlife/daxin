import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const config = await readFile(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
const imagesPage = await readFile(new URL('../app/pages/admin/images.vue', import.meta.url), 'utf8')

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

test('后台图片管理不再提供首页 Banner 配置项', () => {
  assert.doesNotMatch(imagesPage, /key:\s*['\"]home_banner_image['\"]/, '图片管理列表不应再暴露 home_banner_image')
  assert.doesNotMatch(imagesPage, /首页 Banner 图片/, '图片管理文案不应再出现首页 Banner 配置')
})
