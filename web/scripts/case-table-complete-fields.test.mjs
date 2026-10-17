import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const caseTableSource = await readFile(new URL('../app/components/cases/CaseTable.vue', import.meta.url), 'utf8')

test('TRO 案件表格完整换行显示字段，不截断原告或其他长文本', () => {
  assert.match(caseTableSource, /\.case-table\s*\{[^}]*table-layout:\s*fixed/s)
  assert.match(caseTableSource, /\.case-table\s*\{[^}]*min-width:\s*0/s)
  assert.match(caseTableSource, /\.case-table th,\s*\.case-table td\s*\{[^}]*white-space:\s*normal/s)
  assert.match(caseTableSource, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(caseTableSource, /text-overflow:\s*ellipsis|overflow:\s*hidden/)
})
