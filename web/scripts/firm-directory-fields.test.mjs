// 律所目录新增字段（简称 / 地址 / 官网）的前后端契约。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const [directory, repository, queries] = await Promise.all([
  read('../app/components/content/EntityDirectory.vue'),
  read('../app/repositories/entities.ts'),
  read('../server/utils/public/case-queries.ts'),
])

test('律所列表接口返回简称 / 地址 / 官网，品牌不查这三列', () => {
  assert.match(queries, /COALESCE\(e\.short_name, ''\) AS short_name/)
  assert.match(queries, /COALESCE\(e\.address, ''\) AS address/)
  assert.match(queries, /COALESCE\(e\.website, ''\) AS website/)
  assert.match(queries, /shortName: toText\(row\.short_name\)/)
  assert.match(queries, /address: toText\(row\.address\)/)
  assert.match(queries, /website: toText\(row\.website\)/)
})

test('律所摘要类型带上三个可选字段', () => {
  for (const field of ['shortName?: string', 'address?: string', 'website?: string']) {
    assert.ok(repository.includes(field), `FirmSummary 缺少字段：${field}`)
  }
})

test('律所目录展示简称 / 地址 / 官网，官网只接受 http(s) 链接', () => {
  assert.match(directory, /kind === 'firm' && item\.shortName/)
  assert.match(directory, /简称：<strong>\{\{ item\.shortName \}\}<\/strong>/)
  assert.match(directory, /<dt>地址<\/dt>/)
  assert.match(directory, /<dt>官网<\/dt>/)
  assert.match(directory, /item\.address/)
  // 官网链接必须带协议校验与 noopener，避免 javascript: 之类的伪协议。
  assert.match(directory, /function safeWebsite\(value\?: string\): string \{[\s\S]*?\/\^https\?:\\\/\\\/\/i\.test\(url\)/)
  assert.match(directory, /:href="safeWebsite\(item\.website\)"/)
  assert.match(directory, /target="_blank" rel="noopener noreferrer"/)
})

test('律所目录的本地关键词过滤也覆盖简称与地址', () => {
  assert.match(directory, /item\.shortName \?\? ''/)
  assert.match(directory, /item\.address \?\? ''/)
})
