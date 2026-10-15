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

test('站点设置按五个标签分组，字段只保留中文名称和值', () => {
  for (const label of ['站点信息', '首页内容', '关于我们', '二维码管理', '团队业务范围']) {
    assert.ok(siteSettings.includes(`label: '${label}'`), `${label} 标签存在`)
  }
  assert.match(siteSettings, /SETTING_LABELS/)
  assert.doesNotMatch(siteSettings, /SETTING_DESCRIPTIONS|settingDescription\(/)
  assert.doesNotMatch(siteSettings, /valueTypeLabel\(/)
  assert.match(siteSettings, /about_team_paragraphs: '团队介绍内容（首页同步）'/)
  assert.match(siteSettings, /footer_qr_primary: '页脚二维码一'/)
  assert.match(siteSettings, /footer_qr_secondary: '页脚二维码二'/)
  assert.match(siteSettings, /id: 'footer-intro',[^\n]*页脚信息[^\n]*footer_intro', 'footer_registration', 'footer_qr_primary', 'footer_qr_secondary'/)
  assert.match(siteSettings, /AdminSitePublishingSettings/)
  assert.match(publishingSettings, /TRO 公众号/)
  assert.doesNotMatch(publishingSettings, /页脚业务配置/)
})

test('常见问题编辑只显示名称与上下移动作，保留隐藏入口属性', () => {
  assert.match(siteSettings, /常见问题与二维码标题/)
  assert.doesNotMatch(siteSettings, /站内地址|显示此入口|排序值/)
  assert.match(siteSettings, /moveSidebarLink\(index, -1\)/)
  assert.match(siteSettings, /moveSidebarLink\(index, 1\)/)
  assert.match(siteSettings, /normalizeContentSidebar\(null\)/)
  assert.match(siteSettings, /JSON\.stringify\(contentSidebar\.value\)/)
  assert.doesNotMatch(siteSettings, /v-model="link\.(path|enabled|sortOrder)"/)
})

test('常见问题与页面配色、首页数据指标标题恢复旧版字号与字距', () => {
  assert.match(siteSettings, /title: '常见问题与页面配色'/)
  assert.match(siteSettings, /title: '首页数据指标'/)
  assert.match(siteSettings, /admin-settings__group--content/)
  assert.match(siteSettings, /admin-settings__group--stats/)
  assert.match(siteSettings, /\.admin-settings__group--(?:content|stats) \.admin-settings__group-title\s*\{[^}]*font-size:\s*18px;[^}]*letter-spacing:\s*normal;/s)
})

test('常见问题与二维码标题和首页数据指标字段标题处于同一配置位置并居中', () => {
  assert.match(siteSettings, /<div v-if="item\.key === 'content_sidebar'" class="admin-settings__field-head admin-settings__field-head--center">\s*<h4 class="admin-settings__sidebar-title">常见问题与二维码标题<\/h4>\s*<\/div>/)
  assert.match(siteSettings, /<div v-if="settingLabel\(item\.key\)" class="admin-settings__field-head">\s*<label class="admin-settings__label"[^>]*>\s*\{\{ settingLabel\(item\.key\) \}\}/)
  assert.match(siteSettings, /\.admin-settings__field-head--center\s*\{[^}]*justify-content:\s*center;/s)
  assert.match(siteSettings, /\.admin-settings__sidebar-title\s*\{[^}]*font-size:\s*14px;/s)
  assert.doesNotMatch(siteSettings, /group\.id === 'content'.*常见问题与二维码标题/)
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
