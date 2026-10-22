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

test('team intro is the homepage first screen with its configured image as the text background', () => {
  assert.doesNotMatch(indexSource, /<HomeTeamServices/)
  assert.doesNotMatch(indexSource, /home-about__layout/)
  assert.match(indexSource, /<section[\s\S]*?class="home-team-intro"/)
  assert.match(indexSource, /:style="teamBackgroundStyle"/)
  assert.ok(indexSource.includes('backgroundImage: teamBackgroundImage.value'))
  assert.doesNotMatch(indexSource, /home-team-intro__visual|:src="teamBackgroundImage"/)
  assert.match(indexSource, /home-team-intro__content/)
  assert.match(indexSource, /<h1 class="home-team-intro__title">\{\{ teamDisplayTitle \}\}<\/h1>/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
  assert.doesNotMatch(indexSource, /<HomeHero|<section[^>]+home-banner/)
})

test('team intro image and copy stay configurable, while the old hero settings are hidden', () => {
  assert.match(indexSource, /readSettingText\('home_team_background'\)/)
  assert.match(adminSettingsSource, /home_team_background/)
  assert.doesNotMatch(adminSettingsSource, /home_hero_badge:\s*'首屏眉题'/)
  assert.match(adminSettingsSource, /'home_hero_badge',\s*'home_hero_title'/)
})

test('homepage order is team intro, metrics, then five expandable core-business panels', () => {
  const introAt = indexSource.indexOf('class="home-team-intro"')
  const statsAt = indexSource.indexOf('<section class="home-about"')
  const coreAt = indexSource.indexOf('<CoreBusiness')
  assert.ok(introAt > 0, '首页应存在团队介绍区块')
  assert.ok(statsAt > introAt && coreAt > statsAt, '顺序应为团队介绍、数据指标、核心业务')
  assert.match(indexSource, /<CoreBusiness :sections="teamServices"\s*\/>/)
  assert.match(indexSource, /查询 TRO 案件/)
  assert.match(indexSource, /联系我们免费评估案件/)
  assert.doesNotMatch(indexSource, /了解更多/)

  // 横向排列、悬停/点击展开、展开态与收起态配色区分
  assert.match(coreBusinessSource, /core-business__number/)
  assert.match(coreBusinessSource, /String\(index \+ 1\)\.padStart\(2, '0'\)/)
  assert.match(coreBusinessSource, /core-business__icon/)
  assert.match(coreBusinessSource, /aria-expanded/)
  assert.match(coreBusinessSource, /setHovered\(index\)|@mouseenter/)
  assert.match(coreBusinessSource, /@click="toggle\(index\)"/)
  assert.match(coreBusinessSource, /core-business__panel--active/)
  assert.match(coreBusinessSource, /:src="section.imageUrl"/)
  assert.match(coreBusinessSource, /core-business__summary/)
  assert.match(coreBusinessSource, /var\(--color-primary\)/)
})

test('team intro overlays prominent copy on a cover background with contrast scrim', () => {
  assert.match(indexSource, /\.home-team-intro\s*\{[\s\S]*?background-size:\s*cover/)
  assert.match(indexSource, /\.home-team-intro__scrim\s*\{[\s\S]*?linear-gradient/)
  assert.match(indexSource, /home-team-intro--has-background \.home-team-intro__paragraph/)
  assert.match(indexSource, /\.home-team-intro__layout\s*\{[\s\S]*?min-height:/)
  assert.match(indexSource, /\.home-team-intro__content\s*\{[\s\S]*?gap:\s*var\(--space-4\)/)
  assert.match(indexSource, /teamDisplayTitle = computed/)
  assert.match(indexSource, /teamParagraphsFromSettings/)
  assert.match(indexSource, /home-team-intro__button--primary/)
  assert.match(indexSource, /home-team-intro__button--secondary/)
})

test('team business configuration is a site settings tab driven by the database', () => {
  assert.doesNotMatch(adminLayoutSource, /label: '团队业务范围', to: '\/admin\/services'/)
  assert.match(adminSettingsSource, /kind: 'services', label: '团队业务范围'/)
  assert.doesNotMatch(adminHomeSource, /页脚与联系方式|\/admin\/footer/)
  assert.match(adminServicesSource, /navigateTo\('\/admin\/settings\?tab=services'/)
  assert.match(adminServicesSettingsSource, /iconKey|section\.items/)
  assert.match(adminServicesSettingsSource, /板块图片/)
  assert.match(adminServicesSettingsSource, /SettingImageField/)
  // 数据经公开接口 → 仓库层 → 页面，三层字段口径一致
  assert.match(homeApiSource, /ss\.icon_key[\s\S]*?iconKey: String\(row\.icon_key/)
  assert.match(homeApiSource, /section_image_url/)
  assert.match(homeRepositorySource, /imageUrl: String\(section\?\.imageUrl/)
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
