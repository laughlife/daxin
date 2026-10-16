import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SOURCE_CATEGORY_MAP, mapDxfwArticleRow } from './legacy-source.mjs'

test('dxfw 栏目映射保留源栏目名并映射到新版文章分类', () => {
  assert.equal(SOURCE_CATEGORY_MAP[1].name, 'TRO案例')
  assert.equal(SOURCE_CATEGORY_MAP[1].slug, 'tro-alert')
  assert.equal(SOURCE_CATEGORY_MAP[2].name, '成功案例')
  assert.equal(SOURCE_CATEGORY_MAP[2].slug, 'tro-success')
  assert.equal(SOURCE_CATEGORY_MAP[9].slug, 'knowledge')
})

test('映射 CMS 行时保留 dr_1_news 来源 ID、文章分类和封面图片地址', () => {
  const article = mapDxfwArticleRow({
    id: '1977',
    title: '版权案例',
    catid: '1',
    category_name: 'TRO案例',
    inputtime: '1791800000',
    content: '&lt;p&gt;内容&lt;/p&gt;',
    thumb: 'https://daxinfawu.com/uploadfile/202610/cover.jpg',
  })
  assert.equal(article.legacy_source_table, 'dr_1_news')
  assert.equal(article.legacy_source_id, '1977')
  assert.equal(article.categoryName, 'TRO案例')
  assert.equal(article.projectId, 1)
  assert.equal(article.projectTitle, 'TRO案例')
  assert.equal(article.thumb, 'https://daxinfawu.com/uploadfile/202610/cover.jpg')
  assert.equal(article.isTroEntitySource, true)
})
