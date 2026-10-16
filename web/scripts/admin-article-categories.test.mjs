import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as contentQueries from '../server/utils/admin/content-queries.ts'

const apiPath = new URL('../server/api/admin/article-categories.get.ts', import.meta.url)
const pagePath = new URL('../app/pages/admin/articles.vue', import.meta.url)

test('分类字典映射返回全部活动分类并过滤停用项', () => {
  const mapRows = contentQueries.mapAdminArticleCategoryRows
  const rows = [
    { id: '22', slug: 'cpsc-recalls', name: 'CPSC召回', status: '1' },
    { id: 25, slug: 'cross-border-consulting', name: '跨境咨询', status: 1 },
    { id: 12, slug: 'overseas-business', name: '国外业务', status: '0' },
  ]
  assert.deepEqual(mapRows?.(rows), [
    { id: 22, slug: 'cpsc-recalls', name: 'CPSC召回' },
    { id: 25, slug: 'cross-border-consulting', name: '跨境咨询' },
  ])
})

test('文章分类接口要求 article:read 并独立读取未分页的活动分类表', () => {
  assert.equal(existsSync(apiPath), true)
  const source = readFileSync(apiPath, 'utf8')
  assert.match(source, /requireAdmin\(event,\s*'article:read'\)/)
  assert.match(source, /FROM article_categories[\s\S]*?WHERE status\s*=\s*1/)
  assert.doesNotMatch(source, /LIMIT\s+\?/)
})

test('文章编辑分类下拉从完整分类字典加载，不再由当前分页文章推导', () => {
  const source = readFileSync(pagePath, 'utf8')
  assert.match(source, /\/api\/admin\/article-categories/)
  assert.doesNotMatch(source, /const categoryOptions = computed\(\(\) => \{[\s\S]*?for \(const item of items\.value\)/)
})
