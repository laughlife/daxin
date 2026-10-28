// 律所列表与详情：卡片字段、图片、简介 / 多图，以及官网链接的安全处理。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { externalUrlLabel, safeExternalUrl } from '../app/utils/content.ts'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const [directory, detail, repository, queries, listEndpoint, detailEndpoint] = await Promise.all([
  read('../app/components/content/EntityDirectory.vue'),
  read('../app/components/content/EntityDetail.vue'),
  read('../app/repositories/entities.ts'),
  read('../server/utils/public/case-queries.ts'),
  read('../server/api/public/law-firms.get.ts'),
  read('../server/api/public/law-firms/[slug].get.ts'),
])

test('律所列表接口返回简称 / 地址 / 官网 / 图片，品牌不查这些列', () => {
  assert.match(queries, /COALESCE\(e\.short_name, ''\) AS short_name/)
  assert.match(queries, /COALESCE\(e\.address, ''\) AS address/)
  assert.match(queries, /COALESCE\(e\.website, ''\) AS website/)
  assert.match(queries, /COALESCE\(NULLIF\(e\.logo_url, ''\), \(/)
  assert.match(queries, /entity_images ei/)
  assert.match(queries, /logoUrl: toText\(row\.logo_url\)/)
  assert.match(listEndpoint, /findEntitySummaries\('law_firms'/)
})

test('律所列表卡片只显示名称 / 简称 / 官网 / 关联案件，并带图片', () => {
  assert.match(directory, /<p v-if="item\.shortName" class="directory__short-name">/)
  assert.match(directory, /简称：<strong>\{\{ item\.shortName \}\}<\/strong>/)
  assert.match(directory, /官网：<a :href="safeWebsite\(item\.website\)"/)
  // 律所卡片不显示地址；「简介资料整理后补充」只在品牌分支（v-else）里
  const firmCard = directory.slice(directory.indexOf('class="directory__body"'), directory.indexOf('directory__count'))
  assert.doesNotMatch(firmCard, /item\.address/)
  assert.match(directory, /<p v-else class="directory__description">/)
  // 图片：有图显示，失败回退首字占位
  assert.match(directory, /v-if="item\.logoUrl && !failedLogos\.has\(item\.slug\)"/)
  assert.match(directory, /@error="markLogoFailed\(item\.slug\)"/)
  assert.match(directory, /entityInitial\(item\.name\)/)
})

test('律所详情返回简介 / 图片，并展示在名称右侧', () => {
  assert.match(queries, /export async function findPublicFirmProfile/)
  assert.match(queries, /FROM entity_details WHERE entity_type = 'law_firm'/)
  assert.match(queries, /FROM entity_images\s+WHERE entity_type = 'law_firm'/)
  assert.match(queries, /logoUrl: toText\(row\.logo_url\) \|\| images\[0\]/)
  assert.match(detailEndpoint, /intro: toSafeRichText\(found\.firm\.intro\)/)
  // 头图在名称右侧、下方有介绍与图片
  assert.match(detail, /entity-detail__profile--firm/)
  assert.match(detail, /<h2>律所介绍<\/h2>/)
  assert.match(detail, /<h2>律所图片<\/h2>/)
  assert.match(detail, /class="entity-detail__cover entity-detail__cover--firm"/)
  // 历史案件仍保留
  assert.match(detail, /<h2>代理的历史案件<\/h2>/)
})

test('律所摘要与详情类型带上新字段', () => {
  for (const field of ['shortName?: string', 'address?: string', 'website?: string', 'logoUrl?: string', 'intro?: string', 'images?: string[]']) {
    assert.ok(repository.includes(field), `FirmSummary 缺少字段：${field}`)
  }
  assert.match(repository, /export interface FirmDetail \{/)
})

test('官网只接受 http(s)：过滤伪协议并省略协议头展示', () => {
  assert.equal(safeExternalUrl('https://gbc.law/'), 'https://gbc.law/')
  assert.equal(safeExternalUrl('http://vogtip.com'), 'http://vogtip.com')
  assert.equal(safeExternalUrl('javascript:alert(1)'), '')
  assert.equal(safeExternalUrl(''), '')
  assert.equal(safeExternalUrl(undefined), '')
  assert.equal(externalUrlLabel('https://gbc.law/'), 'gbc.law')
})
