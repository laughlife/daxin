import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const adminPages = [
  'settings', 'services', 'articles', 'cases', 'users', 'review', 'media', 'login'
]
const sources = await Promise.all(adminPages.map(page =>
  readFile(new URL(`../app/pages/admin/${page}.vue`, import.meta.url), 'utf8')
))
const entityManager = await readFile(new URL('../app/components/admin/AdminEntityManager.vue', import.meta.url), 'utf8')
const layout = await readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8')
const richEditor = await readFile(new URL('../app/components/admin/AdminRichTextEditor.vue', import.meta.url), 'utf8')

test('后台页面移除用途型副标题和说明块', () => {
  for (const source of [...sources, entityManager]) {
    assert.doesNotMatch(source, /<p[^>]*class="[^"]*(?:__desc|__subtitle)"/)
  }
})

test('后台字段标签与编辑控件横排，窄屏切换为纵排', () => {
  assert.match(layout, /admin-settings__field/)
  assert.match(layout, /grid-template-columns:\s*minmax\(\d+px,\s*\d+px\)\s+minmax\(0,\s*1fr\)/)
  assert.match(layout, /@media\s*\(max-width:\s*767px\)[\s\S]*grid-template-columns:\s*1fr/)
})

test('列表页筛选栏不再显示“筛选与搜索”标题，字段标签与输入框横排', () => {
  for (const source of [sources[2], sources[3], sources[4], entityManager]) {
    assert.doesNotMatch(source, /title="筛选与搜索"|重置筛选/)
  }
  assert.match(sources[4], /admin-users__filter[^\n]*grid-template-columns:[^;]+/)
  assert.match(sources[2], /admin-articles__field \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\)/)
  assert.match(sources[3], /admin-cases__field \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\)/)
})

test('多行文本编辑器随内容增长，不出现内部滚动条', () => {
  assert.match(layout, /field-sizing:\s*content/)
  assert.match(layout, /overflow-y:\s*hidden/)
  assert.doesNotMatch(richEditor, /max-height:\s*640px|overflow:\s*auto/)
})

test('用途说明移除后仍保留校验、只读、上传和保存状态反馈', () => {
  const allSources = [...sources, entityManager, richEditor].join('\n')
  for (const marker of ['role="alert"', 'role="note"', 'role="status"', 'uploadError']) {
    assert.ok(allSources.includes(marker), `应保留必要反馈 ${marker}`)
  }
})
