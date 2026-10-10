// 只读核查：核验队列的 case 条目能否唯一解析到 cases.id。
//
// 结论直接影响 applyValue 的安全性：只有当 (legacy_source_table, legacy_source_id)
// 恰好对应 1 个案件时，把确认值写回才安全；对应多个案件时必须拒绝而不是猜。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

console.log('== 1) 待办核验项分布 ==')
const dist = await queryRows(target, `
SELECT entity_type, field_name, status, COUNT(*) AS n
FROM migration_review_items GROUP BY entity_type, field_name, status ORDER BY n DESC`)
for (const row of dist) console.log(`  ${row.join(' / ')}`)

console.log('\n== 2) case_sources 的 source_id → case_id 基数分布 ==')
const card = await queryRows(target, `
SELECT case_count, COUNT(*) AS sources
FROM (SELECT source_table, source_id, COUNT(DISTINCT case_id) AS case_count
      FROM case_sources GROUP BY source_table, source_id) t
GROUP BY case_count ORDER BY case_count`)
for (const row of card) console.log(`  ${row[1]} 个来源对应 ${row[0]} 个案件`)

console.log('\n== 3) 19 条 case 待办项的可解析性 ==')
const rows = await queryRows(target, `
SELECT r.id, r.field_name, r.legacy_source_id,
       (SELECT COUNT(DISTINCT cs.case_id) FROM case_sources cs
        WHERE cs.source_table = r.legacy_source_table AND cs.source_id = r.legacy_source_id) AS matched_cases
FROM migration_review_items r
WHERE r.entity_type = 'case' AND r.status = 'open'
ORDER BY r.id`)
let unique = 0
let ambiguous = 0
let missing = 0
for (const row of rows) {
  const matched = Number(row[3])
  if (matched === 1) unique += 1
  else if (matched > 1) ambiguous += 1
  else missing += 1
}
console.log(`  共 ${rows.length} 条：唯一可解析 ${unique}，歧义（>1 个案件）${ambiguous}，无法解析 ${missing}`)
const worst = rows.filter((row) => Number(row[3]) > 1).sort((a, b) => Number(b[3]) - Number(a[3]))[0]
if (worst) console.log(`  最严重：核验项 #${worst[0]}（${worst[1]}）来源 ${worst[2]} 命中 ${worst[3]} 个案件`)

console.log('\n== 4) article 待办项的可解析性（articles 有 legacy_source 唯一键）==')
const articleRows = await queryRows(target, `
SELECT COUNT(*) AS total,
       SUM((SELECT COUNT(*) FROM articles a
            WHERE a.legacy_source_table = r.legacy_source_table
              AND a.legacy_source_id = r.legacy_source_id) = 0) AS unresolvable,
       SUM((SELECT COUNT(*) FROM articles a
            WHERE a.legacy_source_table = r.legacy_source_table
              AND a.legacy_source_id = r.legacy_source_id) > 1) AS multi
FROM migration_review_items r
WHERE r.entity_type = 'article' AND r.status = 'open'`)
console.log(`  共 ${articleRows[0][0]} 条：无法解析 ${articleRows[0][1]}，多解 ${articleRows[0][2]}`)

console.log('\n== 5) 结论 ==')
console.log('  case 类核验项存在一对多歧义，applyValue 必须限定「恰好 1 个案件」时才落库，')
console.log('  否则会把人填的原告/立案时间写到错误的案件上。')
