import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const articleList = await readFile(new URL('../app/components/content/ArticleList.vue', import.meta.url), 'utf8')
const contentListing = await readFile(new URL('../app/components/content/ContentListing.vue', import.meta.url), 'utf8')
const articleDetail = await readFile(new URL('../app/components/content/ArticleDetail.vue', import.meta.url), 'utf8')
const homeArticles = await readFile(new URL('../app/components/home/ArticlePreviewSection.vue', import.meta.url), 'utf8')

test('TRO文章列表隐藏标题下方简介，但保留详情页简介', () => {
  assert.match(articleList, /hideExcerpt\??:\s*boolean/)
  assert.match(articleList, /v-if="!hideExcerpt"[^>]*>\s*\{\{ article\.excerpt \}\}/)
  assert.match(contentListing, /:hide-excerpt="section\.group === 'tro'"/)
  assert.match(articleDetail, /:hide-excerpt="section\.group === 'tro'"/)
  assert.match(articleDetail, /article-detail__lead">\s*\{\{ article\.excerpt \}\}/)
})

test('首页仅隐藏 TRO 文章简介，其他业务栏目保留简介', () => {
  assert.match(homeArticles, /section:\s*column\.section/)
  assert.match(homeArticles, /v-if="item\.section !== 'tro'"[^>]*article-preview-card__excerpt/)
})
