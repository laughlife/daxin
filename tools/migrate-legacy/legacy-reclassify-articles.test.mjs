import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mapDxfwArticleRow } from './legacy-source.mjs'
import * as legacyImport from './legacy-import.mjs'

const reclassify = await import('./legacy-reclassify-articles.mjs').catch(() => ({}))

function sourceArticle(id, catid) {
  return mapDxfwArticleRow({ id: String(id), catid: String(catid), title: `source ${id}` })
}

test('新 dxfw 导入使用解析后的分类 slug，不回退到旧栏目 slug', () => {
  assert.equal(legacyImport.resolveArticleImportCategory?.(sourceArticle(1909, 4))?.slug, 'cpsc-recalls')
  assert.equal(legacyImport.resolveArticleImportCategory?.(sourceArticle(2000, 4)), null)
})

test('生成已确认的新栏目映射并排除其他来源文章', () => {
  const ids = [1909, 1918, 1661, 1663, 1838, 1839, 1840, 1844, 1863, 1864, 1874, 1894, 1951, 1800, 1627, 1979]
  const sourceRows = ids.map((id) => sourceArticle(id, id === 1909 || id === 1918 || id === 1661 || id === 1663 ? 4 : id === 1627 || id === 1979 ? 11 : 5))
  const targetRows = sourceRows.map((row, index) => ({
    id: index + 1,
    legacy_source_table: 'dr_1_news',
    legacy_source_id: row.legacy_source_id,
    current_slug: 'domestic-business',
  }))
  targetRows.push({ id: 9999, legacy_source_table: 'other_table', legacy_source_id: '1909', current_slug: 'news' })

  const plan = reclassify.buildReclassificationPlan?.({ sourceArticles: sourceRows, targetArticles: targetRows })
  assert.deepEqual(plan?.updates?.map(({ legacySourceId, categorySlug }) => [legacySourceId, categorySlug]), [
    ['1909', 'cpsc-recalls'], ['1918', 'cpsc-recalls'],
    ['1661', 'freight-case'], ['1663', 'freight-case'],
    ['1838', 'cross-border-consulting'], ['1839', 'cross-border-consulting'],
    ['1840', 'cross-border-consulting'], ['1844', 'cross-border-consulting'],
    ['1863', 'cross-border-consulting'], ['1864', 'cross-border-consulting'],
    ['1874', 'cross-border-consulting'], ['1894', 'cross-border-consulting'],
    ['1951', 'cross-border-consulting'], ['1800', 'freight-case'],
    ['1627', 'tro-alert'], ['1979', 'knowledge'],
  ])
  assert.equal(plan?.targetCount, 16)
  assert.deepEqual(plan?.missingSourceIds, [])
})

test('生成的更新 SQL 只改 dr_1_news 文章的分类字段', () => {
  const sql = reclassify.buildArticleReclassificationSql?.([
    { legacySourceId: '1909', categorySlug: 'cpsc-recalls' },
    { legacySourceId: '1838', categorySlug: 'cross-border-consulting' },
  ]) ?? ''
  assert.match(sql, /legacy_source_table\s*=\s*'dr_1_news'/)
  assert.match(sql, /category_id\s*=\s*CASE/)
  assert.match(sql, /WHEN\s+'1909'\s+THEN/)
  assert.match(sql, /WHEN\s+'1838'\s+THEN/)
  assert.doesNotMatch(sql, /content_html|published_at|status\s*=/i)
})

test('有无法映射的目标文章时禁止 apply', () => {
  const plan = reclassify.buildReclassificationPlan?.({
    sourceArticles: [sourceArticle(1909, 4)],
    targetArticles: [{ id: 1, legacy_source_table: 'dr_1_news', legacy_source_id: '999999', current_slug: 'overseas-business' }],
  })
  assert.equal(plan?.canApply, false)
  assert.deepEqual(plan?.missingSourceIds, ['999999'])
})
