import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const [brandPage, entityManager, remoteSelect, queries, createApi, updateApi, listApi, brandDelete, firmDelete] = await Promise.all([
  read('../app/pages/admin/brands.vue'),
  read('../app/components/admin/AdminEntityManager.vue'),
  read('../app/components/admin/AdminRemoteSelect.vue'),
  read('../server/utils/admin/content-queries.ts'),
  read('../server/api/admin/brands.post.ts'),
  read('../server/api/admin/brands/[id].put.ts'),
  read('../server/api/admin/brands.get.ts'),
  read('../server/api/admin/brands/[id].delete.ts'),
  read('../server/api/admin/law-firms/[id].delete.ts'),
])

test('品牌详情展示采集封面 / Logo（只读，不再提供上传表单）', () => {
  assert.match(entityManager, /const viewCover = computed/)
  assert.match(entityManager, /props\.kind === 'brand' \? \(item\.coverUrl \|\| item\.logoUrl\) : item\.logoUrl/)
  assert.match(entityManager, /class="admin-entity__view-cover"/)
  assert.match(queries, /COALESCE\(logo\.public_url, ''\) AS logo_url/)
  // 后台只读：编辑表单与图片上传已移除
  assert.doesNotMatch(entityManager, /SettingImageField|form\.logoMediaId = /)
  assert.doesNotMatch(brandPage, /with-logo/)
})

test('品牌与律所列表提供删除操作，后端以软删除保留案件关系', () => {
  assert.match(entityManager, /@click="onDelete\(item\)"/)
  assert.match(entityManager, /method: 'DELETE'/)
  assert.match(entityManager, /status: 1/)
  assert.match(listApi, /buildEntityAdminFilterSql/)
  assert.match(brandDelete, /status = 0/)
  assert.match(firmDelete, /status = 0/)
})

test('案件关联选择器在当前候选项未加载时也用名称显示', () => {
  assert.match(remoteSelect, /modelLabel\?: string/)
  assert.match(remoteSelect, /modelLabel \|\| '已关联项目'/)
  assert.doesNotMatch(remoteSelect, /当前选中 ID|#\{modelValue\}/)
})
