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

test('品牌与律所管理隐藏状态筛选、状态列、状态表单与归档操作', () => {
  assert.doesNotMatch(entityTemplate, /entity-status-filter|<th[^>]*>状态<|entity-status|onArchive|归档/)
  assert.doesNotMatch(entities, /const statusFilter|status: statusFilter\.value|watch\(\[keyword, statusFilter\]/)
})

test('编辑品牌/律所时回传原状态，新增项默认为正常', () => {
  assert.match(entities, /status: '1'/)
  assert.match(entities, /form\.status = String\(item\.status\)/)
  assert.match(entities, /status: Number\(form\.status\)/)
})

test('用户管理仍由现有管理员权限保护', () => {
  assert.match(users, /definePageMeta\(\{ layout: 'admin', middleware: 'admin' \}\)/)
  assert.match(users, /useAdminSession\(\)/)
})
