import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const adminHome = readFileSync(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')
const siteSettings = readFileSync(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const publishingSettings = readFileSync(new URL('../app/components/admin/SitePublishingSettings.vue', import.meta.url), 'utf8')
const aboutSettings = readFileSync(new URL('../app/utils/aboutContent.ts', import.meta.url), 'utf8')
const aboutPage = readFileSync(new URL('../app/pages/about.vue', import.meta.url), 'utf8')
const sidebarRoute = new URL('../app/pages/admin/sidebar.vue', import.meta.url)
const footerRoute = new URL('../app/pages/admin/footer.vue', import.meta.url)

test('站点设置按四个标签分组，字段提供中文名称与说明', () => {
  for (const label of ['站点信息', '首页内容', '关于我们', '二维码管理']) {
    assert.ok(siteSettings.includes(`label: '${label}'`), `${label} 标签存在`)
  }
  assert.match(siteSettings, /SETTING_LABELS/)
  assert.match(siteSettings, /SETTING_DESCRIPTIONS/)
  assert.match(siteSettings, /valueTypeLabel/)
  assert.match(siteSettings, /首页团队介绍区域会同步使用/)
  assert.match(siteSettings, /AdminSitePublishingSettings/)
  assert.match(publishingSettings, /TRO 公众号/)
  assert.doesNotMatch(publishingSettings, /页脚业务配置/)
})

test('后台不再提供独立侧边栏管理和页脚与联系方式模块', () => {
  assert.doesNotMatch(adminHome, /label: '侧边栏管理'|to: '\/admin\/sidebar'/)
  assert.doesNotMatch(adminHome, /label: '页脚与联系方式'|to: '\/admin\/footer'/)
  assert.equal(existsSync(sidebarRoute), false)
  assert.equal(existsSync(footerRoute), false)
})

test('二维码配置编辑器只读取和保存二维码，不管理页脚业务数据', async () => {
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
  assert.match(source, /body: \{ kind: 'qr'/)
  assert.doesNotMatch(source, /kind: 'footer'/)
  assert.doesNotMatch(source, /FooterItem|footerItems|页脚导航|业务范围/)
  assert.match(source, /SettingImageField/)
})

test('关于我们移除资质荣誉和团队展示图片配置，联系引导文案归入主图分组', () => {
  assert.match(siteSettings, /id: 'about-hero'[\s\S]*?about_contact_title/)
  assert.doesNotMatch(siteSettings, /about_honors_images: '资质荣誉图片'/)
  assert.doesNotMatch(siteSettings, /about_team_image: '团队展示图片'/)
  assert.match(siteSettings, /'about_honors_images'/)
  assert.match(siteSettings, /'about_team_image'/)
  assert.doesNotMatch(aboutSettings, /honorsImages/)
  assert.doesNotMatch(aboutPage, /资质与荣誉|aria-label="资质荣誉"/)
})
