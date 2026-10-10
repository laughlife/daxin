// 只读核查：校验核验队列接口实际下发的 SQL（表名/列名/语法）。
// 做法：把接口里的「SQL + 参数」按驱动最终发送的形态内联成等价的只读语句执行，
// 不做任何写入；UPDATE/INSERT 一律改成「目标表 + 相同列清单 + WHERE 1 = 0」的 SELECT。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) process.exit(2)

/** 把 ? 依次替换为字面量，模拟驱动发送的语句文本。 */
function inline(sql, params) {
  let index = 0
  return sql.replace(/\?/g, () => {
    const value = params[index]
    index += 1
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'number') return String(value)
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  })
}

const cases = [
  ['列表 COUNT', `SELECT COUNT(*) AS total FROM migration_review_items WHERE 1 = 1 AND status = ? AND entity_type = ?`, ['open', 'case']],
  ['列表分页', `SELECT id, entity_type, legacy_source_table, legacy_source_id, field_name,
         candidate_value, normalized_value, context_snippet, confidence, status,
         resolved_at, resolution_note
         FROM migration_review_items
        WHERE 1 = 1 AND status = ?
        ORDER BY confidence ASC, id ASC
        LIMIT ? OFFSET ?`, ['open', 20, 0]],
  ['单条读取', `SELECT id, entity_type, legacy_source_table, legacy_source_id, field_name,
         candidate_value, normalized_value, context_snippet, confidence, status,
         resolved_at, resolution_note FROM migration_review_items WHERE id = ? LIMIT 1`, [1]],
  ['case 目标解析', `SELECT cs.case_id AS id
              FROM case_sources cs
             WHERE cs.source_table = ? AND cs.source_id = ?
             GROUP BY cs.case_id
             ORDER BY cs.case_id ASC`, ['cn_list', 99]],
  ['article 目标解析', `SELECT a.id AS id
              FROM articles a
             WHERE a.legacy_source_table = ? AND a.legacy_source_id = ?
             ORDER BY a.id ASC`, ['cn_list', 7]],
  ['回填 plaintiff（列校验）', 'SELECT id, `plaintiff`, updated_at FROM cases WHERE 1 = 0 AND id = ?', [1]],
  ['回填 filed_at（列校验）', 'SELECT id, `filed_at`, updated_at FROM cases WHERE 1 = 0 AND id = ?', [1]],
  ['核验项更新（列校验）', `SELECT id, status, resolved_by, resolved_at, resolution_note, updated_at
          FROM migration_review_items WHERE 1 = 0 AND id = ?`, [1]],
  ['审计写入（列校验）', `SELECT user_id, username, action, entity_type, entity_id, before_json, after_json, ip_digest, note, created_at
          FROM admin_audit_logs WHERE 1 = 0`, []],
]

let failed = 0
for (const [name, sql, params] of cases) {
  try {
    const rows = await queryRows(target, inline(sql, params ?? []))
    console.log(`OK    ${name}  (返回 ${rows.length} 行)`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name} :: ${error.message.slice(0, 300)}`)
  }
}

console.log(failed === 0 ? '\n全部校验通过（无任何写入）' : `\n${failed} 项失败`)
