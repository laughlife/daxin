import test from 'node:test'
import assert from 'node:assert/strict'
import { extensionFromContentType, mediaObjectKeyFor, verifyMediaMap } from './legacy-oss-migration.mjs'

test('旧图迁移对象统一放入 Img/当日日期目录，URL 哈希确保可重复执行', () => {
  const date = '20261016'
  const first = mediaObjectKeyFor('https://old.example/a.png?x=1', date)
  assert.match(first, /^Img\/20261016\/[a-f0-9]{64}\.png$/)
  assert.equal(mediaObjectKeyFor('https://old.example/a.png?x=1', date), first)
  assert.notEqual(mediaObjectKeyFor('https://old.example/a.png?x=2', date), first)
})

test('媒体类型扩展名由响应 MIME 确定', () => {
  assert.equal(extensionFromContentType('image/jpeg'), '.jpg')
  assert.equal(extensionFromContentType('image/png; charset=binary'), '.png')
  assert.equal(extensionFromContentType('text/html'), '')
})

test('导入映射必须覆盖清单全部图片且有 OSS 地址', () => {
  const paths = ['https://old.example/a.png']
  assert.equal(verifyMediaMap(paths, { [paths[0]]: { objectKey: 'Img/20261016/a.png', publicUrl: 'https://oss.example/a.png' } }).length, 0)
  assert.equal(verifyMediaMap(paths, {}).length, 1)
})
