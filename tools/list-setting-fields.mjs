// 导出 site_settings 现行字段清单（含当前值），供人工圈定要删除的字段。
//
// 用法：node tools/list-setting-fields.mjs [--json]
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
const rows = await queryRows(target, `
SELECT setting_group, setting_key, value_type, setting_value, media_id
FROM site_settings
WHERE is_current = 1
ORDER BY setting_group, setting_key`)

/** 值过长时截断，便于阅读；完整值仍可从后台查看。 */
function brief(value, limit = 60) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return '（空）'
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

const groups = new Map()
for (const row of rows) {
  const group = String(row[0])
  if (!groups.has(group)) groups.set(group, [])
  groups.get(group).push({
    key: String(row[1]),
    valueType: String(row[2]),
    value: row[3],
    mediaId: row[4],
  })
}

console.log(`site_settings 现行字段共 ${rows.length} 个，分 ${groups.size} 组。\n`)
for (const [group, items] of groups) {
  console.log(`## ${group}（${items.length} 个）`)
  for (const item of items) {
    const media = item.mediaId === null || item.mediaId === undefined ? '' : ` mediaId=${item.mediaId}`
    console.log(`  ${item.key.padEnd(30)} [${item.valueType.padEnd(5)}]${media}  ${brief(item.value)}`)
  }
  console.log('')
}
