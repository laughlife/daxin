import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { sanitizeHtml } from '../app/utils/publicHtml.ts'

const articleSource = await readFile(new URL('../app/pages/admin/articles.vue', import.meta.url), 'utf8')
const template = articleSource.slice(articleSource.indexOf('<template>'))

// 预览弹层已抽成共用组件（编辑器与文章列表共用同一份实现与样式），
// 因此「弹层长什么样、层级多高」这类断言要落在组件上，
// 页面侧只断言「有没有正确接上这个组件」。
const previewSource = await readFile(
  new URL('../app/components/admin/AdminArticlePreview.vue', import.meta.url),
  'utf8',
)

test('文章列表不显示状态筛选或状态列，仍保留显式发布入口', () => {
  assert.doesNotMatch(template, /article-status-filter|<th[^>]*>状态<|STATUS_LABELS\[item\.status\]/)
  assert.match(template, /发布文章/)
})

test('文章状态只在表单内部维护，发布动作使用当前编辑值', () => {
  assert.doesNotMatch(template, /id="article-status"|v-model="form\.status"/)
  assert.match(articleSource, /status: publish \? 'published' : form\.status/)
  assert.match(articleSource, /form\.status = article\.status \|\| 'draft'/)
})

test('预览展示未保存字段且不会提交或改路由', () => {
  // 编辑器侧：有入口按钮，并且把「当前表单值」（未保存内容）传给预览组件
  assert.match(template, /文章预览/)
  assert.match(template, /@click="previewOpen = true"/)
  assert.match(template, /:title="form\.title"/)
  assert.match(template, /:content-html="form\.contentHtml"/)
  assert.match(template, /@close="previewOpen = false"/)

  // 组件侧：负责渲染标题占位与正文，且不触发提交或跳转
  assert.match(previewSource, /\{\{ title \|\| '未填写标题' \}\}/)
  assert.match(previewSource, /<RichArticleBody/)
  assert.doesNotMatch(previewSource, /summary|摘要/)
  assert.doesNotMatch(previewSource, /navigateTo\(|onSubmit|\.post\(|put\(/)
})

test('预览正文先走白名单净化再渲染', () => {
  // 组件内部必须调用 sanitizeHtml，而不是把原始 HTML 直接交给渲染组件
  assert.match(previewSource, /sanitizeHtml\(/)
  assert.match(previewSource, /:html="sanitizedHtml"/)
  // 未清洗的 contentHtml 不得直接进入模板
  assert.doesNotMatch(previewSource, /:html="contentHtml"/)
})

test('预览弹层覆盖固定后台侧栏', () => {
  const backdrop = previewSource.match(/\.admin-article-preview-backdrop\s*\{([^}]+)\}/)?.[1] ?? ''
  const zIndex = Number(backdrop.match(/z-index:\s*(\d+)/)?.[1] ?? 0)
  assert.ok(zIndex > 100, `预览层级 ${zIndex} 必须高于后台侧栏层级 100`)
})

test('文章列表也提供预览内容入口，并按需拉取正文', () => {
  // 需求：列表上也要能预览内容
  assert.match(template, /预览内容/)
  assert.match(template, /@click="openListPreview\(item\)"/)
  // 列表接口不含正文，必须按 id 取详情
  assert.match(articleSource, /openListPreview/)
  assert.match(articleSource, /\/api\/admin\/articles\/\$\{item\.id\}/)
  // 列表预览也复用同一个弹层组件
  assert.match(template, /:loading="listPreviewLoading"/)
  assert.match(template, /@close="closeListPreview"/)
})

test('预览正文先走白名单净化，危险标签与链接不会进入渲染内容', () => {
  const clean = sanitizeHtml('<p>正文</p><script>alert(1)</script><a href="javascript:alert(1)">危险链接</a>')
  assert.equal(clean, '<p>正文</p><a>危险链接</a>')
})
