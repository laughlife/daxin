import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const users = await readFile(new URL('../app/pages/admin/users.vue', import.meta.url), 'utf8')
const entities = await readFile(new URL('../app/components/admin/AdminEntityManager.vue', import.meta.url), 'utf8')
const usersTemplate = users.slice(users.indexOf('<template>'))
const entityTemplate = entities.slice(entities.indexOf('<template>'))

test('用户管理隐藏状态筛选、列表状态和状态编辑控件', () => {
  assert.doesNotMatch(usersTemplate, /statusFilter|STATUS_OPTIONS|data-label="状态"|<th>状态<|<span>状态<|v-model="form\.status"/)
})

test('新账号默认启用，编辑和提交继续沿用已有账号状态', () => {
  assert.match(users, /status: 'active'/)
  assert.match(users, /form\.status = item\.status === 'disabled' \? 'disabled' : 'active'/)
  assert.match(users, /status: form\.status/)
})

test('品牌与律所管理隐藏状态筛选与状态编辑，删除仍是软删除', () => {
  assert.doesNotMatch(entityTemplate, /entity-status-filter|<th[^>]*>状态<|onArchive/)
  assert.doesNotMatch(entities, /const statusFilter|status: statusFilter\.value|watch\(\[keyword, statusFilter\]/)
  // 只读查看里展示当前状态：正常 / 已隐藏
  assert.match(entities, /item\.status === 1 \? '正常' : '已隐藏'/)
})

test('品牌 / 律所后台不再提供新建与编辑表单', () => {
  assert.doesNotMatch(entityTemplate, /<form class="admin-entity__form"|新建\{\{ entityLabel \}\}|openCreate|onSubmit/)
  assert.match(entityTemplate, /@click="openView\(item\)"/)
  assert.match(entities, /async function openView\(item: AdminEntityItem\)/)
})

test('品牌 / 律所后台不再展示 slug', () => {
  assert.doesNotMatch(entityTemplate, /item\.slug|viewItem\.slug|label: 'slug'/)
})

test('用户管理仍由现有管理员权限保护', () => {
  assert.match(users, /definePageMeta\(\{ layout: 'admin', middleware: 'admin' \}\)/)
  assert.match(users, /useAdminSession\(\)/)
})
