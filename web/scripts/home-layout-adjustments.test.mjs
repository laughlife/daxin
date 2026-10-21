import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexSource = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
// 需求 2026-10-20：首页业务块由 HomeTeamServices 卡片改为 CoreBusiness 01-05 展开面板
const coreBusinessSource = await readFile(new URL('../app/components/home/CoreBusiness.vue', import.meta.url), 'utf8')
const advantagesSource = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')
const statsSource = await readFile(new URL('../app/components/home/StatsSection.vue', import.meta.url), 'utf8')
const footerSource = await readFile(new URL('../app/components/layout/SiteFooter.vue', import.meta.url), 'utf8')
const qrSource = await readFile(new URL('../app/components/contact/ContactQrGrid.vue', import.meta.url), 'utf8')
const adminHomeSource = await readFile(new URL('../app/pages/admin/index.vue', import.meta.url), 'utf8')
const adminLayoutSource = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const adminServicesSource = await readFile(new URL('../app/pages/admin/services.vue', import.meta.url), 'utf8')
const adminServicesSettingsSource = await readFile(new URL('../app/components/admin/AdminServicesSettings.vue', import.meta.url), 'utf8')
const adminSettingsSource = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
const homeApiSource = await readFile(new URL('../server/api/public/home.get.ts', import.meta.url), 'utf8')
const homeRepositorySource = await readFile(new URL('../app/repositories/home.ts', import.meta.url), 'utf8')

test('team intro becomes one background-image block with the copy on the left', () => {
  // 旧的「左介绍 + 右四个卡片」两栏布局已取消
  assert.doesNotMatch(indexSource, /<HomeTeamServices/)
  assert.doesNotMatch(indexSource, /home-about__layout/)
  assert.match(indexSource, /class="home-team-intro"/)
  assert.match(indexSource, /:style="teamIntroStyle"/)
  assert.match(indexSource, /home-team-intro__content/)
  assert.match(indexSource, /:title="teamDisplayTitle"/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
})

test('team intro background image is admin-configurable with a readable fallback', () => {
  // 背景图来自后台配置 home_team_background
  assert.match(indexSource, /readSettingText\('home_team_background'\)/)
  // 有图时加 --image 修饰类并压深色遮罩，保证左侧白字可读
  assert.match(indexSource, /'home-team-intro--image': teamBackgroundImage/)
  assert.match(indexSource, /\.home-team-intro--image::before/)
  // 未配置图片时回退深色渐变，而不是露出白底
  assert.match(indexSource, /\.home-team-intro \{[\s\S]*?--color-bg-dark/)
})

test('core business sits below the team intro and offers five expandable panels', () => {
  const introAt = indexSource.indexOf('home-team-intro')
  const coreAt = indexSource.indexOf('<CoreBusiness')
  assert.ok(introAt > 0, '首页应存在团队介绍区块')
  assert.ok(coreAt > introAt, '核心业务必须排在团队介绍之后')
  assert.match(indexSource, /<CoreBusiness :sections="teamServices"\s*\/>/)

  // 横向排列、悬停/点击展开、展开态与收起态配色区分
  // 注意：01-05 序号与右侧「+」号已按用户要求移除（改为每栏一个图标），
  // 因此这里改为断言序号与加号都不存在，避免被无意加回来。
  assert.doesNotMatch(coreBusinessSource, /core-business__index/)
  assert.doesNotMatch(coreBusinessSource, /core-business__marker/)
  assert.match(coreBusinessSource, /core-business__icon/)
  assert.match(coreBusinessSource, /aria-expanded/)
  assert.match(coreBusinessSource, /setHovered\(index\)|@mouseenter/)
  assert.match(coreBusinessSource, /@click="toggle\(index\)"/)
  assert.match(coreBusinessSource, /core-business__panel--active/)
  assert.match(coreBusinessSource, /--color-primary-light/)
  // 需求明确「不预留图片位置」：面板里不应出现图片元素
  assert.doesNotMatch(coreBusinessSource, /<img/)
})

test('team intro copy is styled for dark background readability', () => {
  assert.match(indexSource, /<SectionHeading align="left" :title="teamDisplayTitle"\s*\/>/)
  assert.doesNotMatch(indexSource, /eyebrow="About US"/)
  assert.match(indexSource, /\.home-team-intro__content\s*\{[\s\S]*?gap:\s*var\(--space-4\)/)
  assert.match(indexSource, /teamDisplayTitle = computed/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
  // 深色底上必须反色，否则等于没字
  assert.match(indexSource, /\.home-team-intro__content :deep\(\.section-heading__title\)\s*\{[\s\S]*?--color-text-inverse/)
  assert.match(indexSource, /\.home-team-intro__paragraph\s*\{[\s\S]*?--color-text-inverse/)
})

test('team business configuration is a site settings tab driven by the database', () => {
  assert.doesNotMatch(adminLayoutSource, /label: '团队业务范围', to: '\/admin\/services'/)
  assert.match(adminSettingsSource, /kind: 'services', label: '团队业务范围'/)
  assert.doesNotMatch(adminHomeSource, /页脚与联系方式|\/admin\/footer/)
  assert.match(adminServicesSource, /navigateTo\('\/admin\/settings\?tab=services'/)
  assert.match(adminServicesSettingsSource, /iconKey|section\.items/)
  // 数据经公开接口 → 仓库层 → 页面，三层字段口径一致
  assert.match(homeApiSource, /ss\.icon_key[\s\S]*?iconKey: String\(row\.icon_key/)
  assert.match(homeRepositorySource, /iconKey: String\(section\?\.iconKey/)
  assert.match(adminServicesSettingsSource, /iconKey: toText\(section\.iconKey\)/)
  assert.match(homeApiSource, /from '~\/utils\/homeData\.mjs'/)
  assert.doesNotMatch(homeApiSource, /from '\.\.\/\.\.\/\.\.\/app\/utils\/homeData\.mjs'/)
})

test('all homepage metrics get a subtle selected hover state', () => {
  assert.match(statsSource, /stats-section__item:hover/)
  assert.match(statsSource, /scale\(1\.0\d+\)/)
})

test('core advantages omit numeric prefixes, keep a stable card height, and widen the selected card', () => {
  assert.doesNotMatch(advantagesSource, /home-core-advantages__index|0\{\{\s*index/)
  assert.doesNotMatch(advantagesSource, /home-core-advantages__plus/)
  assert.match(advantagesSource, /displayTitle\(item\.title\)/)
  assert.match(advantagesSource, /replace\(\/\^0\?\[1-4\]\[\.、\\s\]\+/)
  assert.match(advantagesSource, /height:\s*\d+px/)
  assert.match(advantagesSource, /gridTemplateColumns/)
  assert.match(advantagesSource, /home-core-advantages__icon/)
  assert.match(advantagesSource, /core-\$\{iconKey\(item\.title\)\}-black\.png/)
  assert.match(advantagesSource, /core-\$\{iconKey\(item\.title\)\}-red\.png/)
  assert.match(advantagesSource, /home-core-advantages__icon--red/)
  assert.doesNotMatch(advantagesSource, /overflow-y:\s*auto/)
  assert.match(advantagesSource, /home-core-advantages__description-copy/)
  assert.match(advantagesSource, /max-width:\s*\d+ch/)
  assert.match(advantagesSource, /text-align:\s*center/)
  assert.match(advantagesSource, /justify-content:\s*center/)
  assert.match(advantagesSource, /flex-direction:\s*column/)
  assert.match(advantagesSource, /align-items:\s*center/)
})

test('footer hides the public QR names while other QR surfaces can retain them', () => {
  assert.match(footerSource, /hide-name/)
  assert.match(qrSource, /hideName/)
  assert.match(qrSource, /v-if="!hideName"/)
})
