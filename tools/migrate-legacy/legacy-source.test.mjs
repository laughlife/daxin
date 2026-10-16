import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as legacySource from './legacy-source.mjs'

const { SOURCE_CATEGORY_MAP, mapDxfwArticleRow } = legacySource

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
  assert.equal(article.categoryName, 'TRO侵权预警')
  assert.equal(article.projectId, 1)
  assert.equal(article.projectTitle, 'TRO侵权预警')
  assert.equal(article.thumb, 'https://daxinfawu.com/uploadfile/202610/cover.jpg')
  assert.equal(article.isTroEntitySource, true)
})

test('按文章 ID 拆分国外业务和国内业务文章到新栏目', () => {
  const resolver = legacySource.resolveDxfwArticleCategory
  assert.deepEqual(resolver?.({ catid: 4, id: 1909, title: 'CPSC recall' }), {
    slug: 'cpsc-recalls',
    name: 'CPSC召回',
    section: 'tro',
  })
  assert.deepEqual(resolver?.({ catid: 4, id: 1661, title: '货代纠纷' }), {
    slug: 'freight-case',
    name: '货代案例',
    section: 'freight',
  })
  assert.deepEqual(resolver?.({ catid: 5, id: 1838, title: '跨境咨询' }), {
    slug: 'cross-border-consulting',
    name: '跨境咨询',
    section: 'domestic',
  })
  assert.deepEqual(resolver?.({ catid: 5, id: 1800, title: '货运纠纷' }), {
    slug: 'freight-case',
    name: '货代案例',
    section: 'freight',
  })
})

test('按附件表路径生成旧站封面地址并兼容 ID 1977 的 PNG', () => {
  const buildUrl = legacySource.buildDxfwAttachmentUrl
  assert.equal(buildUrl?.('202610/d3a71f84fefdfee.png'), 'https://daxinfawu.com/uploadfile/202610/d3a71f84fefdfee.png')
  assert.equal(buildUrl?.('/83/3b/8b36cb431b5aa0d245be4e62cdb8e6b3/380x250_crop.jpg'), 'https://daxinfawu.com/uploadfile/83/3b/8b36cb431b5aa0d245be4e62cdb8e6b3/380x250_crop.jpg')
  assert.equal(buildUrl?.('uploadfile/202610/cover.jpg'), 'https://daxinfawu.com/uploadfile/202610/cover.jpg')
  assert.equal(buildUrl?.('https://cdn.example.test/cover.jpg'), 'https://cdn.example.test/cover.jpg')
  assert.equal(buildUrl?.(''), '')
})
