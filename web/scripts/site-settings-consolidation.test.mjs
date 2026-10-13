import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const adminHome = readFileSync(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')
const siteSettings = readFileSync(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const publishingSettings = readFileSync(new URL('../app/components/admin/SitePublishingSettings.vue', import.meta.url), 'utf8')
const sidebarRoute = new URL('../app/pages/admin/sidebar.vue', import.meta.url)
const footerRoute = new URL('../app/pages/admin/footer.vue', import.meta.url)

test('站点信息在 FAQ 配置后集中展示四类二维码和页脚业务配置', () => {
  assert.match(siteSettings, /<AdminSitePublishingSettings/)
  assert.match(siteSettings, /item\.key === 'content_sidebar'[\s\S]*?<AdminSitePublishingSettings/)
  assert.match(siteSettings, /常见问题/)
  assert.match(publishingSettings, /TRO 公众号/)
  assert.match(publishingSettings, /页脚业务配置/)
})

test('后台不再提供独立侧边栏管理和页脚与联系方式模块', () => {
  assert.doesNotMatch(adminHome, /label: '侧边栏管理'|to: '\/admin\/sidebar'/)
  assert.doesNotMatch(adminHome, /label: '页脚与联系方式'|to: '\/admin\/footer'/)
  assert.equal(existsSync(sidebarRoute), false)
  assert.equal(existsSync(footerRoute), false)
})

test('合并的配置编辑器仍通过原后台设置 API 保存二维码与页脚业务数据', async () => {
  let source = ''
  try {
    source = readFileSync(new URL('../app/components/admin/SitePublishingSettings.vue', import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  for (const key of ['qr-tro-public', 'qr-labor-public', 'qr-tro-consult', 'qr-labor-consult']) {
    assert.ok(source.includes(key), `missing ${key}`)
  }
  assert.match(source, /query: \{ kind: 'qr' \}/)
  assert.match(source, /query: \{ kind: 'footer' \}/)
  assert.match(source, /body: \{ kind: 'qr'/)
  assert.match(source, /body: \{ kind: 'footer'/)
  assert.match(source, /SettingImageField/)
})
