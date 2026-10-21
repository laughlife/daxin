import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('公开页面移除模板生成的眉题、副标题与配置使用说明', async () => {
  const about = await read('../app/pages/about.vue')
  const home = await read('../app/pages/index.vue')
  const cases = await read('../app/pages/tro/cases/index.vue')
  const check = await read('../app/pages/infringement-check.vue')
  const header = await read('../app/components/layout/SiteHeader.vue')

  assert.doesNotMatch(about, /eyebrow=|description="|可在「后台 → 站点设置/)
  assert.doesNotMatch(home, /eyebrow="About US"/)
  assert.doesNotMatch(cases, /description="检索 TRO 案件/)
  assert.doesNotMatch(check, /description="填写待检测的品牌/)
  assert.doesNotMatch(header, /class="site-header__subtitle"/)
  assert.match(header, /class="site-header__name"/)
})

test('产品侵权检测提交至后台，移除 Mock、演示和输入占位提示', async () => {
  const check = await read('../app/pages/infringement-check.vue')
  assert.doesNotMatch(check, /Mock|演示|自研|placeholder=/i)
  assert.match(check, /\$fetch\(['"]\/api\/public\/infringement-check/)
  assert.doesNotMatch(check, /当前仅进行本地必填校验，不会提交或保存填写的信息。|不会发送或保存/)
  assert.match(check, /提交检测/)
})

test('官网所有栏目标题下不渲染浅色辅助介绍，团队标题继续读取站点配置', async () => {
  const home = await read('../app/pages/index.vue')
  const sectionPaths = [
    '../app/components/home/BusinessSection.vue',
    '../app/components/home/CasePreviewSection.vue',
    '../app/components/home/ArticlePreviewSection.vue',
    '../app/components/home/HomeCoreAdvantages.vue',
    '../app/components/home/HomeLegalGuides.vue',
    '../app/components/content/ContentListing.vue',
    '../app/components/content/EntityDirectory.vue',
  ]
  const sections = await Promise.all(sectionPaths.map(read))

  for (const source of sections) {
    assert.doesNotMatch(source, /<SectionHeading\b[^>]*\b:description=/s)
    assert.doesNotMatch(source, /<SectionHeading\b[^>]*\bdescription=/s)
  }
  assert.match(home, /<h1 class="home-team-intro__title">\{\{ teamDisplayTitle \}\}<\/h1>/)
  assert.match(home, /readSettingText\('home_team_title'\)/)
})

test('TRO 案件查询不显示即时筛选和日期解释提示', async () => {
  const search = await read('../app/components/cases/CaseSearchPanel.vue')
  assert.doesNotMatch(search, /输入即时筛选|查询条件会同步到 URL|刷新后可恢复/)
  assert.doesNotMatch(search, /case-search-panel__hint|case-search-panel__field-hint|case-search-date-hint/)
})
