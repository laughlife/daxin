// 文章重新分类：按标题判定归属栏目，让空的 tab 有内容。
//
// 背景：800 篇公众号文章当初全部落在 tro-success / knowledge / labor-case / freight-case，
// 而 TRO侵权预警、热点资讯、普法动态、普法干货 等 tab 都是 0 篇。
//
// 用法：
//   node tools/classify-articles.mjs            # 试算，只打印分布与样例
//   node tools/classify-articles.mjs --apply    # 执行 UPDATE（按 id 精确更新）
//
// 判定原则（优先级，不是纯打分）：
//   纯打分会误判 ——「CHRYSLER」里的 HR 命中劳动关键词、「重磅回归」命中热点资讯。
//   因此强信号优先、宽泛词兜底，拿不准就保持原栏目不动。

import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const APPLY = process.argv.includes('--apply')

function query(sql) {
  const out = execFileSync(MYSQL, [
    '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
    '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
    '--execute', `USE daxin; ${sql}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter(Boolean).map((line) => line.split('\t'))
}

const ALERT_STRONG = ['预警', '雷', '名单', '合集', '集锦', '播报', '速递', '最新案件', '被冻', '冻结', '沦陷', '中招', '被告', '被诉']
const WIN_STRONG = ['胜诉', '成功案例', '大信格略胜诉', '拿回', '驳回', '免赔', '0赔偿', '零赔偿', '和解成功']
const TRO_CONTEXT = ['TRO', '侵权', '版权', '商标', '专利', 'KEITH', 'GBC']
const LABOR = ['劳动', '员工', '社保', '工资', '加班', '辞退', '离职', '竞业', '试用期', '工伤', '裁员', '提成', '用工']
const FREIGHT = ['货代', '货运', '订舱', '报关', '清关', '拖车', '海运', '空运', '集装箱', '承运人', '提单', '保税']
const KNOWLEDGE = ['科普', '判定标准', '认定标准', '区别', '怎么', '如何', '技巧', '攻略', '避坑', '误区', '解读', '拆解']

/** 返回目标栏目 slug；null 表示保持原栏目不动。 */
function classify(title) {
  const text = title.toUpperCase()
  const has = (list) => list.some((keyword) => text.includes(keyword.toUpperCase()))
  const hasTro = has(TRO_CONTEXT)
  const hasWin = has(WIN_STRONG)
  const hasAlert = has(ALERT_STRONG)
  const hasLabor = has(LABOR)
  const hasFreight = has(FREIGHT)

  // 挂靠具体业务的胜诉/和解案例留在原栏目（货代案例、劳动纠纷）
  if (hasWin && hasFreight && !hasAlert) return null
  if (hasWin && hasLabor && !hasAlert) return null
  // TRO 语境的胜诉/和解留在 TRO成功案例；只有「预警/名单/雷」这类播报才进 TRO侵权预警
  if (hasTro && hasWin) return 'tro-success'
  if (hasTro && hasAlert) return 'tro-alert'
  if (hasAlert && !hasLabor && !hasFreight) return 'tro-alert'
  if (hasLabor) return 'labor-case'
  if (hasFreight) return 'freight-case'
  if (has(KNOWLEDGE)) return 'knowledge'
  return null
}

const categories = query('SELECT id, slug FROM article_categories ORDER BY id;')
const CATEGORY = new Map(categories.map(([id, slug]) => [slug, Number(id)]))
const SLUG_BY_ID = new Map(categories.map(([id, slug]) => [Number(id), slug]))
const rows = query("SELECT id, category_id, REPLACE(REPLACE(title, CHAR(10), ' '), CHAR(13), ' ') FROM articles ORDER BY id;")

const moves = new Map()
const stays = new Map()

for (const [idText, categoryIdText, title] of rows) {
  const id = Number(idText)
  const currentSlug = SLUG_BY_ID.get(Number(categoryIdText)) ?? '?'
  const target = classify(title)
  if (target && target !== currentSlug) {
    if (!moves.has(target)) moves.set(target, [])
    moves.get(target).push({ id, from: currentSlug, title })
  } else {
    stays.set(currentSlug, (stays.get(currentSlug) ?? 0) + 1)
  }
}

function fromCounts(items) {
  const map = new Map()
  for (const item of items) map.set(item.from, (map.get(item.from) ?? 0) + 1)
  return [...map.entries()].map(([k, v]) => `${k}:${v}`).join(' ')
}

console.log('=== 各栏目将获得的文章 ===')
for (const [slug, items] of [...moves.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${slug.padEnd(22)} +${String(items.length).padStart(4)}  来自 ${fromCounts(items)}`)
  for (const sample of items.slice(0, 2)) console.log(`      · ${sample.title.slice(0, 60)}`)
}

console.log('\n=== 保持不动的 ===')
for (const [slug, count] of [...stays.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${slug.padEnd(22)} ${count}`)
}

if (!APPLY) {
  console.log('\n（试算模式，未写库。加 --apply 执行。）')
  process.exit(0)
}

const statements = []
for (const [slug, items] of moves) {
  const targetId = CATEGORY.get(slug)
  if (!targetId || !items.length) continue
  statements.push(`UPDATE articles SET category_id = ${targetId}, updated_at = NOW() WHERE id IN (${items.map((i) => i.id).join(',')});`)
}
if (!statements.length) {
  console.log('没有需要移动的文章。')
  process.exit(0)
}
execFileSync(MYSQL, [
  '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
  '--connect-timeout=5', '--default-character-set=utf8mb4', '--execute', `USE daxin;\n${statements.join('\n')}`,
], { encoding: 'utf8', stdio: 'inherit' })
console.log(`\n已执行 ${statements.length} 条 UPDATE，影响 ${[...moves.values()].reduce((n, l) => n + l.length, 0)} 篇。`)
