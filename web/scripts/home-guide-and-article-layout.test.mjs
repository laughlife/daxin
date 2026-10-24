import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const articlesSource = await readFile(new URL('../app/components/home/ArticlePreviewSection.vue', import.meta.url), 'utf8')
const homeApiSource = await readFile(new URL('../server/api/public/home.get.ts', import.meta.url), 'utf8')

test('four article categories keep three aligned cards with fixed title slots', () => {
  assert.match(homeApiSource, /HOME_ARTICLES_PER_CATEGORY = 3/)
  assert.match(homeApiSource, /tro-alert[\s\S]*tro-success[\s\S]*labor-case[\s\S]*freight-case/)
  assert.match(articlesSource, /articles: column\.articles\.slice\(0, 3\)/)
  assert.match(articlesSource, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  // 已改为图片在上、标题在下：纵向排列且不再写死高度
  assert.match(articlesSource, /article-preview-card\s*\{[\s\S]*?flex-direction:\s*column/)
  // 缩略图改为整宽 + 长图比例
  assert.match(articlesSource, /article-preview-card__thumb\s*\{[\s\S]*?aspect-ratio:\s*900\s*\/\s*382/)
  assert.match(articlesSource, /grid-auto-rows:\s*1fr/)
  assert.match(articlesSource, /article-preview-section__list\s*>\s*li\s*\{[^}]*display:\s*flex/s)
  assert.match(articlesSource, /article-preview-card__title\s*\{[^}]*min-height:\s*calc\(1\.45em\s*\*\s*3\)/s)
  // 移动端卡片也使用一致的固定框架尺寸
  assert.match(articlesSource, /@media\s*\(max-width:\s*639px\)/)
  assert.match(articlesSource, /\.article-preview-card\s*\{[^}]*height:\s*250px/s)
})
