import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const queries = await readFile(new URL('../server/utils/public/case-queries.ts', import.meta.url), 'utf8')

test('品牌与律所列表的关联案件数实时统计已发布案件', () => {
  const summaries = queries.slice(
    queries.indexOf('export async function findEntitySummaries'),
    queries.indexOf('/** 命中关键词 / 分类过滤的品牌数'),
  )
  assert.match(summaries, /\$\{publishedEntityCaseCountSql\(table\)\} AS case_count/)
  assert.doesNotMatch(summaries, /e\.case_count/)
  assert.match(summaries, /ORDER BY 5 DESC, e\.name ASC/)

  // 关联表 case_brands / case_law_firms 已停止写入，
  // 统计改为与列表一致的文本匹配（英文主干 + 中文名称 + 简称）。
  assert.match(queries, /FROM cases c/)
  assert.match(queries, /c\.publish_status = 'published'/)
  assert.match(queries, /caseLatin: 'c\.brand_latin'/)
  assert.match(queries, /caseLatin: 'c\.firm_latin'/)
  assert.match(queries, /entityLatin: 'e\.name_latin'/)
  assert.match(queries, /LOCATE\(\$\{columns\.caseLatin\}, \$\{columns\.entityLatin\}\) > 0/)
  assert.doesNotMatch(queries, /FROM case_brands relation/)
  assert.doesNotMatch(queries, /FROM case_law_firms relation/)
})

test('律所列表额外返回简称 / 地址 / 官网，品牌不查这三列', () => {
  assert.match(queries, /COALESCE\(e\.short_name, ''\) AS short_name/)
  assert.match(queries, /COALESCE\(e\.address, ''\) AS address/)
  assert.match(queries, /COALESCE\(e\.website, ''\) AS website/)
  assert.match(queries, /if \(table !== 'law_firms'\) return summary/)
})
