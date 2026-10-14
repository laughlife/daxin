import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { sanitizeHtml } from '../app/utils/publicHtml.ts'

const articleSource = await readFile(new URL('../app/pages/admin/articles.vue', import.meta.url), 'utf8')
const template = articleSource.slice(articleSource.indexOf('<template>'))

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
  assert.match(template, /文章预览/)
  assert.match(template, /\{\{ form\.title \|\| '未填写标题' \}\}/)
  assert.match(template, /:html="previewHtml"/)
  assert.match(articleSource, /previewHtml = computed\(\(\) => sanitizeHtml\(form\.contentHtml\)\)/)
  assert.match(template, /@click="previewOpen = false"/)
  assert.match(template, /@click="previewOpen = true"/)
  assert.doesNotMatch(template, /@click="preview.*save|navigateTo\(/)
})

test('预览弹层覆盖固定后台侧栏', () => {
  const backdrop = articleSource.match(/\.admin-articles__preview-backdrop\s*\{([^}]+)\}/)?.[1] ?? ''
  const zIndex = Number(backdrop.match(/z-index:\s*(\d+)/)?.[1] ?? 0)
  assert.ok(zIndex > 100, `预览层级 ${zIndex} 必须高于后台侧栏层级 100`)
})

test('预览正文先走白名单净化，危险标签与链接不会进入渲染内容', () => {
  const clean = sanitizeHtml('<p>正文</p><script>alert(1)</script><a href="javascript:alert(1)">危险链接</a>')
  assert.equal(clean, '<p>正文</p><a>危险链接</a>')
})
