import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
const rows = await queryRows(target, `
SELECT id, title, width, height, object_key
FROM media_assets
WHERE legacy_source_table = 'legacy-site' AND deleted_at IS NULL
ORDER BY id`)

console.log(`legacy-site 素材共 ${rows.length} 条：`)
for (const row of rows) {
  console.log(`  id=${String(row[0]).padStart(4)}  ${String(row[1]).padEnd(24)} ${row[2]}x${row[3]}  ${row[4]}`)
}
