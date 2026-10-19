import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const queries = await readFile(new URL('../server/utils/public/case-queries.ts', import.meta.url), 'utf8')

test('品牌与律所列表的关联案件数实时统计已发布案件', () => {
  const summaries = queries.slice(
    queries.indexOf('export async function findEntitySummaries'),
    queries.indexOf('/** 品牌库匹配的品牌数'),
  )
  assert.match(summaries, /\$\{publishedEntityCaseCountSql\(table\)\} AS case_count/)
  assert.doesNotMatch(summaries, /e\.case_count/)
  assert.match(summaries, /ORDER BY 5 DESC, e\.name ASC/)
  assert.match(queries, /JOIN cases c ON c\.id = relation\.case_id AND c\.publish_status = 'published'/)
  assert.match(queries, /WHERE relation\.law_firm_id = e\.id/)
  assert.match(queries, /WHERE relation\.brand_id = e\.id/)
})
