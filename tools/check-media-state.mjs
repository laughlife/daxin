import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
const counts = await queryRows(target, `
SELECT COUNT(*) AS total, SUM(deleted_at IS NULL) AS active, SUM(deleted_at IS NOT NULL) AS deleted
FROM media_assets`)
console.log(`  media_assets 总计=${counts[0][0]} 未删除=${counts[0][1]} 已软删除=${counts[0][2]}`)

const deleted = await queryRows(target, `
SELECT id, object_key, title FROM media_assets WHERE deleted_at IS NOT NULL ORDER BY id`)
for (const row of deleted) console.log(`    软删除 id=${row[0]} key=${row[1]} title=${row[2]}`)

const batches = await queryRows(target, `
SELECT migration_batch_id, COUNT(*) FROM articles WHERE migration_batch_id IS NOT NULL GROUP BY migration_batch_id`)
console.log(`  文章迁移批次：${JSON.stringify(batches)}`)
