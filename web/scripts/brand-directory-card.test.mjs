import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const [directory, queries, repository] = await Promise.all([
  readFile(new URL('../app/components/content/BrandDirectory.vue', import.meta.url), 'utf8'),
  readFile(new URL('../server/utils/public/case-queries.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/repositories/entities.ts', import.meta.url), 'utf8'),
])

test('侵权品牌卡片提供图片或首字母占位，并支持加载失败回退', () => {
  assert.match(directory, /item\.logoUrl && !failedLogoSlugs\.has\(item\.slug\)/)
  assert.match(directory, /:src="item\.logoUrl"/)
  assert.match(directory, /@error="markLogoFailed\(item\.slug\)"/)
  assert.match(directory, /brandInitial\(item\.name\)/)
})

test('品牌卡片展示原告、代理律所、起诉州、已发案数和两个入口', () => {
  for (const text of ['品牌原告：', '代理律所：', '起诉州：', '已发案：', '品牌详情', '查看 TRO 案件']) {
    assert.ok(directory.includes(text), `缺少品牌卡片字段或操作：${text}`)
  }
  assert.match(directory, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
})

test('品牌公开接口返回有效 Logo 和最新已发布案件的卡片信息', () => {
  assert.match(queries, /LEFT JOIN media_assets logo ON logo\.id = b\.logo_media_id AND logo\.usage_scope = 'logo' AND logo\.deleted_at IS NULL/)
  assert.match(queries, /ROW_NUMBER\(\) OVER \([\s\S]*?PARTITION BY cb\.brand_id[\s\S]*?\)/)
  assert.match(queries, /JOIN cases c ON c\.id = cb\.case_id AND c\.publish_status = 'published'/)
  assert.match(queries, /COALESCE\(latest\.law_firm, ''\) AS law_firm/)
  assert.match(repository, /logoUrl\?: string/)
  assert.match(repository, /stateCode\?: string/)
})
