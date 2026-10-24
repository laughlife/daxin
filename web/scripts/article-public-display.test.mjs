import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const articleList = await read('../app/components/content/ArticleList.vue')
const contentListing = await read('../app/components/content/ContentListing.vue')
const articleDetail = await read('../app/components/content/ArticleDetail.vue')
const homeArticles = await read('../app/components/home/ArticlePreviewSection.vue')
const homeCaseCard = await read('../app/components/home/CasePreviewCard.vue')
const articlePage = await read('../app/pages/[...content].vue')

test('文章列表和首页各分类卡片不展示摘要与重复详情入口', () => {
  for (const source of [articleList, homeArticles]) {
    assert.doesNotMatch(source, /article\.excerpt|阅读全文|查看详情/)
  }
  assert.doesNotMatch(contentListing, /hide-excerpt/)
})

test('文章详情只渲染正文图片，不重复渲染摘要或独立封面', () => {
  assert.doesNotMatch(articleDetail, /article\.excerpt|article-detail__cover|article-detail__lead|hide-excerpt/)
  assert.match(articleDetail, /<RichArticleBody/)
})

test('首页文章和案件卡片保留标题链接，不再显示指向同地址的冗余按钮', () => {
  assert.match(homeArticles, /<NuxtLink :to="article\.href">\{\{ article\.title \}\}<\/NuxtLink>/)
  assert.doesNotMatch(homeCaseCard, /查看案件详情|case-preview-card__more/)
  assert.match(homeCaseCard, /<NuxtLink :to="`\/tro\/cases\/\$\{record\.slug\}`">\{\{ record\.plaintiffBrand \|\| record\.caseNumber \}\}<\/NuxtLink>/)
})

test('首页和栏目页文章标题使用统一的常规字号，不读取数据库字号', () => {
  for (const source of [articleList, homeArticles]) {
    assert.doesNotMatch(source, /titleFontSize|titleStyle|previewTitleStyle/)
    assert.match(source, /font-size:\s*var\(--text-sm\)/)
    assert.match(source, /font-weight:\s*400/)
  }
})

test('文章摘要不再进入页面 SEO description', () => {
  assert.doesNotMatch(articlePage, /article\.value\?\.excerpt/)
})
