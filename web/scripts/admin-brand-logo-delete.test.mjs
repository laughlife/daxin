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

test('品牌编辑支持品牌图片 OSS 上传和保存', () => {
  assert.match(brandPage, /with-logo/)
  assert.match(entityManager, /<SettingImageField/)
  assert.match(entityManager, /usage-scope="logo"/)
  assert.match(entityManager, /body\.logoMediaId = form\.logoMediaId/)
  assert.match(createApi, /logo_media_id/)
  assert.match(updateApi, /changes\.logo_media_id = parsed\.value/)
  assert.match(queries, /logoMediaId: toNullableId\(row\.logo_media_id\)/)
  assert.match(queries, /LEFT JOIN media_assets logo/)
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
