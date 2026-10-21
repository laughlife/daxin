import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const articlesSource = await readFile(new URL('../app/components/home/ArticlePreviewSection.vue', import.meta.url), 'utf8')
const homeApiSource = await readFile(new URL('../server/api/public/home.get.ts', import.meta.url), 'utf8')

test('four article categories keep three fixed-size cards in a horizontal row', () => {
  assert.match(homeApiSource, /HOME_ARTICLES_PER_CATEGORY = 3/)
  assert.match(homeApiSource, /tro-alert[\s\S]*tro-success[\s\S]*labor-case[\s\S]*freight-case/)
  assert.match(articlesSource, /articles: column\.articles\.slice\(0, 3\)/)
  assert.match(articlesSource, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(articlesSource, /article-preview-card\s*\{[\s\S]*?flex-direction:\s*row[\s\S]*?height:\s*168px/)
  assert.match(articlesSource, /article-preview-card__thumb\s*\{[\s\S]*?width:\s*124px[\s\S]*?height:\s*124px/)
  assert.match(articlesSource, /@media\s*\(max-width:\s*639px\)[\s\S]*?article-preview-card\s*\{[\s\S]*?height:\s*136px[\s\S]*?article-preview-card__thumb\s*\{[\s\S]*?width:\s*100px[\s\S]*?height:\s*100px/)
})
