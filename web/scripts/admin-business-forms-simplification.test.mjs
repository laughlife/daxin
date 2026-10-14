import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const [adminLayout, articlesPage, casesPage, entityManager] = await Promise.all([
  readFile(new URL('../app/layouts/admin.vue', import.meta.url), 'utf8'),
  readFile(new URL('../app/pages/admin/articles.vue', import.meta.url), 'utf8'),
  readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8'),
  readFile(new URL('../app/components/admin/AdminEntityManager.vue', import.meta.url), 'utf8'),
])

const articleTemplate = articlesPage.slice(articlesPage.indexOf('<template>'))
const articleForm = articleTemplate.slice(articleTemplate.indexOf('<form class="admin-articles__form"'))
const caseTemplate = casesPage.slice(casesPage.indexOf('<template>'))
const caseForm = caseTemplate.slice(caseTemplate.indexOf('<form class="admin-cases__form"'))
const entityTemplate = entityManager.slice(entityManager.indexOf('<template>'))
const entityForm = entityTemplate.slice(entityTemplate.indexOf('<form class="admin-entity__form"'))

test('后台账号与角色放在 Logo 右侧并分别标签化，退出按钮清晰突出', () => {
  const account = adminLayout.match(/\.admin-shell__account\s*\{([^}]+)\}/)?.[1] ?? ''
  const logout = adminLayout.match(/\.admin-shell__logout\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(account, /justify-content:\s*flex-start/)
  assert.doesNotMatch(account, /border-left:/)
  assert.match(adminLayout, /admin-shell__identity--account/)
  assert.match(adminLayout, /admin-shell__identity--role/)
  assert.match(logout, /background:\s*var\(--color-primary\)/)
  assert.match(logout, /min-height:/)
  assert.match(adminLayout, /admin-shell__logout--|admin-shell__logout/)
})

test('文章列表预览入口有清楚的按钮样式，列表与编辑器预览仍保留', () => {
  assert.match(articleTemplate, /variant="primary"[\s\S]*?class="admin-articles__preview-button"[\s\S]*?预览内容/)
  assert.match(articleTemplate, /:loading="listPreviewLoading"/)
  assert.match(articleTemplate, /@click="openListPreview\(item\)"/)
  assert.match(articleTemplate, /文章预览/)
})

test('文章、案件、品牌、律所与用户的新建入口都和搜索控件同排', async () => {
  const [casesPage, usersPage] = await Promise.all([
    readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8'),
    readFile(new URL('../app/pages/admin/users.vue', import.meta.url), 'utf8'),
  ])
  assert.match(articleTemplate, /admin-articles__filter-form[\s\S]*?搜索[\s\S]*?新建文章/)
  assert.match(casesPage, /admin-cases__filter-form[\s\S]*?搜索[\s\S]*?新建案例/)
  assert.match(entityManager, /admin-entity__filter-form[\s\S]*?搜索[\s\S]*?新建\{\{ entityLabel \}\}/)
  assert.match(usersPage, /admin-users__filters[\s\S]*?查询[\s\S]*?新建账号/)
  assert.match(articlesPage, /\.admin-articles__filter-form \{\s*display: flex;/)
  assert.match(casesPage, /\.admin-cases__filter-form \{\s*display: flex;/)
  assert.match(entityManager, /\.admin-entity__filter-form \{\s*display: flex;/)
})

test('文章编辑移除辅助说明、HTML 原文入口和 slug 字段，但保留校验反馈和 slug 读写', () => {
  assert.doesNotMatch(articleForm, /slug（可选）|查看／编辑 HTML 原文（高级）|admin-articles__warning|当前 slug：|后台没有单独的分类字典接口/)
  assert.match(articleForm, /v-if="titleError"/)
  assert.match(articleForm, /正文/)
  assert.match(articlesPage, /if \(form\.slug\.trim\(\)\) body\.slug = form\.slug\.trim\(\)/)
  assert.match(articlesPage, /form\.slug = article\.slug/)
})

test('律所和品牌编辑隐藏 slug 与说明文字，继续保留名称校验和自动 slug 数据', () => {
  assert.doesNotMatch(entityForm, /slug（可选）|当前 slug：|仅律所有该字段|关联案件数：只读|多个别名用逗号分隔/)
  assert.match(entityForm, /v-if="nameError"/)
  assert.match(entityManager, /if \(form\.slug\.trim\(\)\) body\.slug = form\.slug\.trim\(\)/)
  assert.match(entityManager, /form\.slug = item\.slug/)
})

test('案件编辑删除静态提示，保留字段及输入错误反馈', () => {
  assert.doesNotMatch(caseForm, /格式：\{\{ CASE_NUMBER_HINT \}\}|按 id 覆盖式替换|品牌候选按关键词分页加载|律所候选同样按关键词分页加载|侵权类型保存在 case_ip_types|empty-hint=/)
  assert.match(caseForm, /案件号（必填）/)
  assert.match(caseForm, /涉案品牌/)
  assert.match(caseForm, /代理律所/)
  assert.match(caseForm, /v-if="caseNumberError"/)
  assert.match(caseForm, /v-if="filedAtError"/)
})
