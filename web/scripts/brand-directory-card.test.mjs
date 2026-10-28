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

test('品牌卡片整体可点击，展示案件相关信息并移除独立操作按钮', () => {
  for (const text of ['品牌方：', '代理律所：', '品牌分类：', '起诉州：', '已发案：', '查看品牌详情：']) {
    assert.ok(directory.includes(text), `缺少品牌卡片字段或链接语义：${text}`)
  }
  assert.match(directory, /class="brand-card"\s*:to="`\/brands\/\$\{item\.slug\}`"/)
  assert.doesNotMatch(directory, /brand-card__action|查看 TRO 案件/)
  // 卡片网格随容器宽度自适应（每列最小 340px），窄屏自动变单列
  assert.match(directory, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 340px\), 1fr\)\)/)
})

test('品牌卡片统一展示品牌方，字段与详情一致', () => {
  const facts = directory.slice(
    directory.indexOf('class="brand-card__body"'),
    directory.indexOf('class="brand-card__media"'),
  )
  const labels = [...facts.matchAll(/<strong>([^<]+)：<\/strong>/g)].map(match => match[1])
  // 品牌方整行在上，其后是分类 / 起诉州 / 代理律所 / 已发案；不再出现「原告」
  assert.deepEqual(labels, ['品牌方', '品牌分类', '起诉州', '代理律所', '已发案'])
  assert.doesNotMatch(directory, /品牌原告|品牌方（原告）/)
})

test('品牌图片铺在「品牌分类 ~ 已发案」右侧单元格', () => {
  assert.match(directory, /grid-template-areas: "party party" "facts media"/)
  assert.match(directory, /\.brand-card__media \{[^}]*grid-area: media;[^}]*align-self: stretch;/s)
  assert.match(directory, /\.brand-card__media img \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: cover;/s)
  assert.doesNotMatch(directory, /brand-card__logo/)
})

test('品牌类型标签使用蓝、绿、红纯色区分，不继承金色主题', () => {
  assert.match(directory, /data-type='trademark'[^\n]*--brand-type-color:\s*#3183cf/)
  assert.match(directory, /data-type='patent'[^\n]*--brand-type-color:\s*#10b981/)
  assert.match(directory, /data-type='copyright'[^\n]*--brand-type-color:\s*#d92d2d/)
  assert.doesNotMatch(directory, /#f97316|#ea580c/i)
})

test('品牌公开接口返回有效 Logo 和最新已发布案件的卡片信息', () => {
  const directoryQuery = queries.slice(
    queries.indexOf('function brandDirectoryCte'),
    queries.indexOf('/** 单个品牌 / 律所，找不到返回 null。 */'),
  )
  assert.match(directoryQuery, /LEFT JOIN media_assets logo ON logo\.id = b\.logo_media_id AND logo\.usage_scope = 'logo' AND logo\.deleted_at IS NULL/)
  // 采集已停止写 case_brands：匹配改成文本规则，并在 CTE 里按品牌聚合成最新案件与类型
  assert.doesNotMatch(directoryQuery, /case_brands/)
  assert.match(directoryQuery, /WITH brand_case AS \(/)
  assert.match(directoryQuery, /ROW_NUMBER\(\) OVER \(PARTITION BY brand_id/)
  assert.match(directoryQuery, /LEFT JOIN brand_agg agg ON agg\.brand_id = b\.id/)
  assert.match(directoryQuery, /COALESCE\(agg\.law_firm, ''\) AS law_firm/)
  assert.match(directoryQuery, /COUNT\(\*\) OVER \(\) AS total/)
  assert.match(repository, /logoUrl\?: string/)
  assert.match(repository, /stateCode\?: string/)
})
