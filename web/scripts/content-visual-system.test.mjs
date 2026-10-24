import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [listing, detail, articleList, directory, columns, sidebar] = await Promise.all([
  'app/components/content/ContentListing.vue',
  'app/components/content/ArticleDetail.vue',
  'app/components/content/ArticleList.vue',
  'app/components/content/EntityDirectory.vue',
  'app/components/layout/ContentColumns.vue',
  'app/components/layout/ContentSidebar.vue'
].map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')))
const homeArticles = await readFile(new URL('../app/components/home/ArticlePreviewSection.vue', import.meta.url), 'utf8')

test('public listing pages use the site section spacing, field, and heading scale', () => {
  assert.match(listing, /\.listing-page\s*\{[^}]*padding-block:\s*var\(--space-section\)/s)
  assert.match(listing, /\.listing-search\s*\{[^}]*gap:\s*var\(--space-4\)/s)
  assert.match(listing, /\.listing-page__eyebrow\s*\{[^}]*font-size:\s*var\(--text-sm\)/s)
  assert.match(directory, /\.directory\s*\{[^}]*padding-block:\s*var\(--space-section\)/s)
  assert.match(directory, /border-radius:\s*var\(--radius-lg\)/)
})

test('article detail and article cards use shared type, spacing, and radius tokens', () => {
  assert.match(detail, /\.article-detail\s*\{[^}]*padding-block:\s*var\(--space-section-compact\)\s+var\(--space-section\)/s)
  assert.match(detail, /\.article-detail__body\s*\{[^}]*padding:\s*var\(--space-8\)/s)
  assert.match(detail, /h1\s*\{[^}]*font-size:\s*var\(--heading-1\)/s)
  assert.match(articleList, /\.article-list\s*\{[^}]*gap:\s*var\(--space-5\)/s)
  assert.match(articleList, /\.article-list__card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s)
  assert.match(articleList, /h2\s*\{[^}]*font-size:\s*var\(--text-sm\)/s)
  assert.match(articleList, /h2\s*\{[^}]*font-weight:\s*400/s)
})

test('two-column content and sidebars share measured spacing and card padding', () => {
  assert.match(columns, /grid-template-columns:\s*minmax\(0,1fr\)\s+320px/)
  assert.match(columns, /gap:\s*var\(--space-8\)/)
  assert.match(sidebar, /\.sidebar-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s)
  assert.match(sidebar, /\.sidebar-card\s*\{[^}]*padding:\s*var\(--space-6\)/s)
})

test('mobile article cards keep their fixed swipe rail inside the page width', () => {
  assert.match(homeArticles, /\.article-preview-section__columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  assert.match(homeArticles, /\.article-preview-section__columns\s*\{[^}]*min-width:\s*0/s)
  assert.match(homeArticles, /\.article-preview-section__column,[\s\S]*?min-width:\s*0/s)
  assert.match(homeArticles, /\.article-preview-section__list\s*\{[^}]*overflow-x:\s*auto/s)
  assert.match(homeArticles, /flex:\s*0\s+0\s+280px/)
})
