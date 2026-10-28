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
  // 列表不展示图片，因此列表查询不再查 logo_url
  const summaries = queries.slice(
    queries.indexOf('export async function findEntitySummaries'),
    queries.indexOf('export async function countPublicBrandDirectoryEntries'),
  )
  assert.doesNotMatch(summaries, /e\.logo_url/)
  assert.match(listEndpoint, /findEntitySummaries\('law_firms'/)
})

test('律所列表卡片只显示名称 / 简称 / 官网 / 关联案件，不放图片', () => {
  const template = directory.slice(directory.indexOf('<template>'))
  assert.match(directory, /<p v-if="item\.shortName" class="directory__short-name">/)
  assert.match(directory, /简称：<strong>\{\{ item\.shortName \}\}<\/strong>/)
  assert.match(directory, /官网：<a :href="safeWebsite\(item\.website\)"/)
  // 律所卡片不显示地址；「简介资料整理后补充」只在品牌分支（v-else）里
  assert.doesNotMatch(template, /item\.address/)
  assert.match(directory, /<p v-else class="directory__description">/)
  // 列表不再渲染图片（详情页才有图）
  assert.doesNotMatch(template, /directory__logo|item\.logoUrl|failedLogos|entityInitial/)
})

test('律所名称字号调小、字重减轻', () => {
  assert.match(directory, /h2 \{[^}]*font-size:\s*var\(--text-lg\)/)
  assert.match(directory, /h2 \{[^}]*font-weight:\s*600/)
  assert.doesNotMatch(directory, /h2 \{[^}]*font-size:\s*var\(--heading-3\)/)
})

test('律所详情保留横长图，作为资料卡底部的通栏', () => {
  assert.match(queries, /export async function findPublicFirmProfile/)
  assert.match(queries, /FROM entity_details WHERE entity_type = 'law_firm'/)
  assert.match(detailEndpoint, /intro: toSafeRichText\(found\.firm\.intro\)/)
  assert.match(detail, /entity-detail__profile--firm/)
  assert.match(detail, /<h2>律所介绍<\/h2>/)
  // 图片是 1500×600 左右的横图：放在资料下方，贴到卡片左下角、不加白边
  assert.match(detail, /class="entity-detail__banner"/)
  assert.match(detail, /\.entity-detail__banner \{ display:flex; justify-content:flex-start; margin:0 calc\(-1 \* var\(--space-8\)\) calc\(-1 \* var\(--space-8\)\); background:transparent; border-top:1px solid var\(--color-border\); \}/)
  assert.match(detail, /width:auto; max-width:100%; height:auto; max-height:380px; object-fit:contain;/)
  // 详情已去掉右栏头图与图片画廊（避免同一张图重复）
  assert.doesNotMatch(detail, /entity-detail__cover--firm/)
  assert.doesNotMatch(detail, /<h2>律所图片<\/h2>/)
  // 历史案件板块也已移除
  assert.doesNotMatch(detail, /代理的历史案件|entity-detail__cases/)
})

test('律所详情图片只取带水印的 marks 版本（数据层保留，页面暂不展示）', () => {
  assert.match(queries, /entity_type = 'law_firm' AND entity_id = \? AND image_url <> ''\s+AND \$\{WATERMARKED_ENTITY_IMAGE_SQL\}/)
})

test('律所资料按两列排布：简称 | 侵权类型，官网 | 关联案件，地址整行在下方', () => {
  // 品牌与律所共用同一套两列资料版式
  assert.match(detail, /\.entity-detail__facts \{ display:grid; grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(detail, /\.entity-detail__facts > div \{ display:grid; grid-template-columns:5\.5em minmax\(0, 1fr\);/)
  assert.match(detail, /\.entity-detail__fact--wide \{ grid-column:1 \/ -1; \}/)
  // 顺序即版式：简称、侵权类型、官网、关联案件、地址（整行）
  const firmFacts = detail.slice(detail.indexOf('const firmFacts'), detail.indexOf('// 切换实体'))
  const order = [...firmFacts.matchAll(/\{ label: '([^']+)'/g)].map(match => match[1])
  assert.deepEqual(order, ['简称', '侵权类型', '官网', '关联案件', '地址'])
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
