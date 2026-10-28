// 品牌详情页：资料字段、介绍清洗、图片画廊，以及小程序「起诉信息」历史发案。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { toSafeRichText } from '../server/utils/public/sanitize.ts'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const [detail, repository, queries, entityMatch, endpoint, importer, migration] = await Promise.all([
  read('../app/components/content/EntityDetail.vue'),
  read('../app/repositories/entities.ts'),
  read('../server/utils/public/case-queries.ts'),
  read('../server/utils/public/entity-match.ts'),
  read('../server/api/public/brands/[slug].get.ts'),
  read('../../tools/import-mini-program.mjs'),
  read('../../database/migrations/055_entity_case_rows.sql'),
])

test('品牌详情接口返回资料、介绍与图片', () => {
  assert.match(queries, /export async function findPublicBrandProfile/)
  assert.match(queries, /FROM entity_details WHERE entity_type = 'brand'/)
  assert.match(queries, /FROM entity_images\s+WHERE entity_type = 'brand'/)
  // 原告 / 代理律所 / 起诉州取最新一条关联案件
  assert.match(queries, /ORDER BY \(c\.filed_at IS NULL\) ASC, c\.filed_at DESC, c\.id DESC/)
  assert.match(endpoint, /intro: toSafeRichText\(found\.brand\.intro\)/)
  assert.match(endpoint, /cases/)
  assert.match(repository, /export interface BrandProfile extends BrandSummary/)
  for (const field of ['lawsuitType?: string', 'coverUrl?: string', 'intro?: string', 'images?: string[]']) {
    assert.ok(repository.includes(field), `BrandProfile 缺少字段：${field}`)
  }
})

test('品牌详情页展示资料 / 介绍 / 图片，历史发案只读小程序行', () => {
  assert.match(detail, /class="entity-detail__profile/)
  assert.match(detail, /v-for="fact in brandFacts"/)
  // 页面不再用 cases 关联渲染历史案件（历史发案来自 entity_case_rows）
  assert.doesNotMatch(detail, /entity-detail__cases|代理的历史案件|summary\.cases/)
  assert.match(detail, /<h2>品牌介绍<\/h2>/)
  assert.match(detail, /v-html="summary\.intro"/)
  assert.match(detail, /<h2>品牌图片<\/h2>/)
  assert.match(detail, /loading="lazy"/)
  assert.match(detail, /显示全部 \{\{ brandImages\.length \}\} 张/)
})

test('品牌历史发案：小程序「起诉信息」入库并在详情页最下方按表格展示', () => {
  // 表结构
  assert.match(migration, /CREATE TABLE IF NOT EXISTS entity_case_rows/)
  assert.match(migration, /case_number VARCHAR\(255\)/)
  // 采集：解析 #qsTable 并整块替换
  assert.match(importer, /function parseCaseRows/)
  assert.match(importer, /id="qsTable"/)
  assert.match(importer, /INSERT INTO entity_case_rows/)
  assert.match(importer, /await saveCaseRows\(db, 'brand', brandId, detail\.caseRows \|\| \[\]\)/)
  // 接口：原样返回，不 JOIN cases
  assert.match(queries, /FROM entity_case_rows\s+WHERE entity_type = 'brand' AND entity_id = \?/)
  assert.match(queries, /historyCases:/)
  assert.match(repository, /historyCases\?: BrandHistoryCase\[\]/)
  // 页面：四列表格，放在品牌图片之后
  assert.match(detail, /<h2>历史发案<\/h2>/)
  for (const header of ['起诉时间', '案件号', '代理律所', '受理法院']) {
    assert.ok(detail.includes(`<th scope="col">${header}</th>`), `历史发案缺少列：${header}`)
  }
  assert.match(detail, /class="entity-detail__case-table"/)
  assert.match(detail, /v-for="\(row, index\) in historyCases"/)
})

test('品牌详情与律所详情共用两列资料版式，品牌方整行', () => {
  assert.match(detail, /\.entity-detail__facts > \.entity-detail__fact--wide \{ grid-column:1 \/ -1; \}/)
  const brandFacts = detail.slice(detail.indexOf('const brandFacts'), detail.indexOf('/* ------------------------------- 律所资料'))
  const order = [...brandFacts.matchAll(/\{ label: '([^']+)'/g)].map(match => match[1])
  // 分类 / 起诉州 / 代理律所 / 关联案件，最后是整行的品牌方
  assert.deepEqual(order, ['品牌分类', '起诉州', '代理律所', '关联案件', '品牌方'])
  assert.match(brandFacts, /label: '品牌方'[\s\S]*?wide: true/)
})

test('品牌详情不再区分原告，只展示品牌方', () => {
  assert.doesNotMatch(detail, /品牌原告|品牌方（原告）/)
  assert.match(detail, /label: '品牌方', value: item\.brandOwner \|\| item\.plaintiff \|\| ''/)
})

test('品牌页不单独放通栏图，封面并入品牌图片画廊', () => {
  const brandBranch = detail.slice(
    detail.indexOf('品牌档案 · BRAND PROFILE'),
    detail.indexOf('代理律所 · LAW FIRM PROFILE'),
  )
  assert.doesNotMatch(brandBranch, /entity-detail__banner/)
  // 封面排到画廊第一张，其余图片去重后跟随
  assert.match(detail, /const brandImages = computed\(\(\) => \{[\s\S]*?cover \? \[cover, \.\.\.rest\] : rest/)
  assert.match(detail, /<h2>品牌图片<\/h2>/)
})

test('品牌标题比其它页面小一号，长名称不会占满整屏', () => {
  assert.match(detail, /\.entity-detail__headline h1 \{[^}]*font-size:\s*clamp\(20px, 2\.2vw, 28px\)/)
  assert.doesNotMatch(detail, /\.entity-detail__headline h1 \{[^}]*var\(--heading-1\)/)
})

test('品牌图片只取带水印的 marks 版本，避免同图出现两次', () => {
  // 过滤常量在 entity-match.ts，公开站与后台共用
  assert.match(entityMatch, /export const WATERMARKED_ENTITY_IMAGE_SQL = `image_url LIKE '%\/images\/marks\/%'`/)
  assert.match(queries, /WATERMARKED_ENTITY_IMAGE_SQL/)
  // 品牌画廊查询带上水印过滤
  assert.match(queries, /entity_type = 'brand' AND entity_id = \? AND image_url <> ''\s+AND \$\{WATERMARKED_ENTITY_IMAGE_SQL\}/)
})

test('富文本简介：纯文本分段包 <p>，HTML 走白名单清洗', () => {
  assert.equal(toSafeRichText(''), '')
  assert.equal(toSafeRichText('  第一段\n\n第二段  '), '<p>第一段</p><p>第二段</p>')
  assert.equal(
    toSafeRichText('<p>正文</p><script>alert(1)</script><p><br></p>'),
    '<p>正文</p>',
  )
  assert.equal(
    toSafeRichText('<p style="text-align:justify">原告是 <strong>美国</strong> 企业</p>'),
    '<p>原告是 <strong>美国</strong> 企业</p>',
  )
  // 危险链接与事件属性一律丢弃
  const cleaned = toSafeRichText('<p><a href="javascript:alert(1)" onclick="x()">链接</a></p>')
  assert.doesNotMatch(cleaned, /javascript|onclick/)
})
