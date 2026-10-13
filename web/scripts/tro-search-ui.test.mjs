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

test('all three filters use equal full-width rows', () => {
  assert.match(panelSource, /grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(panelSource, /case-search-panel__field--full/)
  assert.doesNotMatch(panelSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
})

test('TRO cases API supports 50 rows without changing the shared article/admin cap', () => {
  assert.match(querySource, /MAX_CASE_PAGE_SIZE = 50/)
  assert.match(casesApiSource, /MAX_CASE_PAGE_SIZE/)
  assert.match(querySource, /MAX_PAGE_SIZE = 48/)
})
