import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ADMIN_ONLY_ROLES,
  ADMIN_WRITE_ROLES,
  MEDIA_READ_ONLY_NOTICE,
  READ_ONLY_NOTICE,
  REVIEW_READ_ONLY_NOTICE,
  SETTINGS_READ_ONLY_NOTICE,
  canManageAdminUsers,
  canWriteContent,
  canWriteMedia,
  canWriteReview,
  canWriteSettings,
  hasAnyRole,
  isReadOnlyViewer,
  nextUniqueSlug,
} from '../app/utils/adminPermission.ts'

test('admin 可写全部域，并可管理账号', () => {
  for (const check of [canWriteContent, canWriteSettings, canWriteReview, canWriteMedia, canManageAdminUsers]) {
    assert.equal(check(['admin']), true)
  }
})

test('editor 可写内容/配置/媒体/核验，但不可管理账号', () => {
  for (const check of [canWriteContent, canWriteSettings, canWriteReview, canWriteMedia]) {
    assert.equal(check(['editor']), true, 'editor 应具备该写权限')
  }
  assert.equal(canManageAdminUsers(['editor']), false, 'editor 不应能管理账号')
})

test('viewer 对任何写操作都是 false', () => {
  for (const check of [canWriteContent, canWriteSettings, canWriteReview, canWriteMedia, canManageAdminUsers]) {
    assert.equal(check(['viewer']), false)
  }
  assert.equal(isReadOnlyViewer(['viewer']), true)
})

test('角色未加载或为空时按只读处理', () => {
  // 宁可先禁用按钮，也不要让只读角色看到能点却必然 403 的控件
  for (const value of [undefined, null, [], [''], ['unknown-role']]) {
    assert.equal(canWriteContent(value), false, `不应放行：${JSON.stringify(value)}`)
  }
  assert.equal(isReadOnlyViewer(undefined), true)
})

test('同时持有两种角色时任一满足即可写', () => {
  assert.equal(canWriteContent(['viewer', 'editor']), true)
  assert.equal(canManageAdminUsers(['editor', 'admin']), true)
})

test('入参同时兼容 AdminUser 对象与角色数组', () => {
  // 历史上三个模块的入参类型不一致（一个收 AdminUser、两个收 roles），合并后必须两种都支持
  const user = { id: 1, username: 'editor', displayName: '', email: '', status: 'active', roles: ['editor'] }
  assert.equal(canWriteContent(user), true)
  assert.equal(canWriteContent(user.roles), true)

  const viewer = { ...user, roles: ['viewer'] }
  assert.equal(canWriteContent(viewer), false)
  assert.equal(canWriteSettings(viewer.roles), false)
})

test('hasAnyRole 对空集合与非法值返回 false', () => {
  assert.equal(hasAnyRole([], ADMIN_WRITE_ROLES), false)
  assert.equal(hasAnyRole(undefined, ADMIN_WRITE_ROLES), false)
  assert.equal(hasAnyRole(['viewer'], ADMIN_WRITE_ROLES), false)
  assert.equal(hasAnyRole(['admin'], ADMIN_ONLY_ROLES), true)
  assert.equal(hasAnyRole(['editor'], ADMIN_ONLY_ROLES), false)
})

test('只读说明文案存在且为中文', () => {
  for (const notice of [READ_ONLY_NOTICE, SETTINGS_READ_ONLY_NOTICE, REVIEW_READ_ONLY_NOTICE, MEDIA_READ_ONLY_NOTICE]) {
    assert.ok(notice.length > 0)
    assert.match(notice, /[\u4e00-\u9fa5]/, '说明文案必须是中文')
  }
})

test('nextUniqueSlug 生成不与已有值冲突的 slug', () => {
  assert.equal(nextUniqueSlug('new-item', []), 'new-item-1')
  assert.equal(nextUniqueSlug('new-item', ['new-item-1']), 'new-item-2')
  assert.equal(nextUniqueSlug('new-item', ['new-item-1', 'new-item-2']), 'new-item-3')
  // slug 在服务端按不区分大小写比较，这里也必须如此，否则会出现仅大小写不同的重复项
  assert.equal(nextUniqueSlug('new-item', ['NEW-ITEM-1']), 'new-item-2')
  assert.equal(nextUniqueSlug('x', ['X-1', 'x-2', 'X-3']), 'x-4')
})
