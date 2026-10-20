import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const searchSource = await readFile(new URL('../app/composables/useCaseSearch.ts', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../app/pages/tro/cases/index.vue', import.meta.url), 'utf8')
const panelSource = await readFile(new URL('../app/components/cases/CaseSearchPanel.vue', import.meta.url), 'utf8')
const listingSource = await readFile(new URL('../app/components/content/ContentListing.vue', import.meta.url), 'utf8')
const querySource = await readFile(new URL('../server/utils/public/query.ts', import.meta.url), 'utf8')
const casesApiSource = await readFile(new URL('../server/api/public/cases.get.ts', import.meta.url), 'utf8')

test('TRO case search defaults to 50 and removes date shortcut navigation', () => {
  assert.match(searchSource, /pageSize = 50/)
  assert.match(pageSource, /useCaseSearch\(\{ pageSize: 50 \}\)/)
  assert.doesNotMatch(pageSource, /cases-page__shortcuts/)
  assert.doesNotMatch(pageSource, />\s*(今日起案件|近三天起案件|全部历史案件)\s*</)
})

test('keyword spans a full row and the type/date filters share the next row', () => {
  assert.match(panelSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(panelSource, /case-search-panel__field--keyword[\s\S]*?grid-column: 1 \/ -1/)
  assert.match(panelSource, /case-search-panel__field--type/)
  assert.match(panelSource, /case-search-panel__field--date/)
  assert.match(panelSource, /@media \(max-width: 639px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/)
  assert.doesNotMatch(panelSource, /case-search-panel__field--full/)
})

test('TRO案件查询的清空按钮与侵权类型、起诉时间同排并可自动换行', () => {
  assert.match(panelSource, /case-search-panel__filters/)
  assert.match(panelSource, /case-search-panel__filters[\s\S]*?case-search-panel__reset/)
  assert.match(panelSource, /case-search-panel__filters\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/s)
  assert.doesNotMatch(panelSource, /case-search-panel__actions/)
})

test('文章搜索使用胶囊搜索框，日期区间留在下一行且窄屏可换行', () => {
  // 需求 2026-10-20：关键词改为公共 SearchPill（放大镜 + 金色按钮），
  // 因此不再有 .listing-search__keyword 这套「标签 + 输入框」样式。
  assert.match(listingSource, /<SearchPill[\s\S]*?v-model="keyword"/)
  assert.doesNotMatch(listingSource, /\.listing-search__keyword\s*\{/)
  assert.match(listingSource, /listing-search__date/)
  assert.match(listingSource, /listing-search__reset/)
  assert.match(listingSource, /\.listing-search__filters\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/s)
  assert.match(listingSource, /\.listing-search__date\s*\{[^}]*flex-direction:\s*column/s)
})

test('home core business no longer uses image icons (requirement: no image placeholders)', async () => {
  // 需求 2026-10-20 明确「不预留图片位置」，原来的红色 3D 图标卡片已移除，
  // 这里改为断言新的核心业务面板不含任何图片元素，防止图标被加回来。
  const coreBusinessSource = await readFile(new URL('../app/components/home/CoreBusiness.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(coreBusinessSource, /service-tro\.png|service-ip\.png|service-dispute\.png|service-cross-border\.png/)
  assert.doesNotMatch(coreBusinessSource, /<img/)
})

test('TRO cases API supports 50 rows without changing the shared article/admin cap', () => {
  assert.match(querySource, /MAX_CASE_PAGE_SIZE = 50/)
  assert.match(casesApiSource, /MAX_CASE_PAGE_SIZE/)
  assert.match(querySource, /MAX_PAGE_SIZE = 48/)
})
