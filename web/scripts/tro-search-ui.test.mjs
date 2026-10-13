import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const searchSource = await readFile(new URL('../app/composables/useCaseSearch.ts', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../app/pages/tro/cases/index.vue', import.meta.url), 'utf8')
const panelSource = await readFile(new URL('../app/components/cases/CaseSearchPanel.vue', import.meta.url), 'utf8')
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

test('home service cards use the supplied red 3D icons by service category', async () => {
  const servicesSource = await readFile(new URL('../app/components/home/HomeTeamServices.vue', import.meta.url), 'utf8')
  assert.match(servicesSource, /service-tro\.png/)
  assert.match(servicesSource, /service-ip\.png/)
  assert.match(servicesSource, /service-dispute\.png/)
  assert.match(servicesSource, /service-cross-border\.png/)
  assert.match(servicesSource, /:src="iconFor\(section\)"/)
})

test('TRO cases API supports 50 rows without changing the shared article/admin cap', () => {
  assert.match(querySource, /MAX_CASE_PAGE_SIZE = 50/)
  assert.match(casesApiSource, /MAX_CASE_PAGE_SIZE/)
  assert.match(querySource, /MAX_PAGE_SIZE = 48/)
})
