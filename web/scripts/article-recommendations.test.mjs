import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectReading } from '../app/utils/articleRecommendations.ts'

test('推荐阅读只选真实来源，按日期排序，同源文章去重', () => {
  const articles = [
    { href: '/tro/guides/1', publishedAt: '2024-01-01', source: { articleId: 1 } },
    { href: '/faq/tro/1', publishedAt: '2024-01-01', source: { articleId: 1 } },
    { href: '/tro/news/2', publishedAt: '2025-01-01', source: { articleId: 2 } },
    { href: '/tro/news/demo', publishedAt: '2026-01-01' },
    { href: '/faq/labor/3', publishedAt: '2025-02-01', source: { articleId: 3 } }
  ]
  assert.deepEqual(selectReading(articles, 'tro').map(x => x.source.articleId), [2, 1])
  assert.deepEqual(selectReading(articles, 'labor').map(x => x.source.articleId), [3])
  assert.equal(selectReading(articles, 'all', 1).length, 1)
})
