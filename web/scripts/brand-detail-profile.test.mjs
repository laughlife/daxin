// 品牌详情页：资料字段、介绍清洗、图片画廊，以及不再展示历史发案。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { toSafeRichText } from '../server/utils/public/sanitize.ts'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const [detail, repository, queries, endpoint] = await Promise.all([
  read('../app/components/content/EntityDetail.vue'),
  read('../app/repositories/entities.ts'),
  read('../server/utils/public/case-queries.ts'),
  read('../server/api/public/brands/[slug].get.ts'),
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

test('品牌详情页展示资料 / 介绍 / 图片，且不再渲染历史发案', () => {
  assert.match(detail, /class="entity-detail__profile"/)
  assert.match(detail, /v-for="fact in brandFacts"/)
  // 历史案件只在律所分支出现（品牌档案之后、律所档案之前不应有）
  const casesIndex = detail.indexOf('<section class="entity-detail__cases">')
  const firmProfileIndex = detail.indexOf('代理律所 · LAW FIRM PROFILE')
  assert.ok(casesIndex > firmProfileIndex, '历史案件列表只应出现在律所分支')
  assert.equal((detail.match(/代理的历史案件<\/h2>/g) ?? []).length, 1)
  assert.match(detail, /<h2>品牌介绍<\/h2>/)
  assert.match(detail, /v-html="summary\.intro"/)
  assert.match(detail, /<h2>品牌图片<\/h2>/)
  assert.match(detail, /loading="lazy"/)
  assert.match(detail, /显示全部 \{\{ brandImages\.length \}\} 张/)
  // 律所页保留历史案件
  assert.match(detail, /<h2>代理的历史案件<\/h2>/)
})

test('品牌标题比其它页面小一号，长名称不会占满整屏', () => {
  assert.match(detail, /\.entity-detail__headline h1 \{[^}]*font-size:\s*clamp\(20px, 2\.2vw, 28px\)/)
  assert.doesNotMatch(detail, /\.entity-detail__headline h1 \{[^}]*var\(--heading-1\)/)
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
