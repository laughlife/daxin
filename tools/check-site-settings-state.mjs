// 只读核对 site_settings 的当前行状态（每个 key 应恰好 1 行 is_current=1）。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

const totals = await queryRows(target, `
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT setting_key) AS distinct_keys,
       SUM(is_current = 1) AS current_rows
FROM site_settings`)
console.log(`总计 ${totals[0][0]} 行 / ${totals[0][1]} 个不同 key / is_current=1 共 ${totals[0][2]} 行`)

// 关键不变式：每个 key 恰好一行 is_current=1。历史版本行（is_current=0）是允许的，
// 那是「就地更新并递增 version」策略下刻意保留的可追溯记录。
const currentDup = await queryRows(target, `
SELECT setting_key, COUNT(*) AS n
FROM site_settings WHERE is_current = 1
GROUP BY setting_key HAVING COUNT(*) > 1 ORDER BY n DESC`)
if (currentDup.length === 0) {
  console.log('✓ 每个 key 恰好一行 is_current=1')
} else {
  console.log('✗ 存在多个 is_current=1 的 key（会让读取方取到多条配置）：')
  for (const row of currentDup) console.log(`  ${row[0]} → ${row[1]} 行`)
}

const history = await queryRows(target, `
SELECT COUNT(*) AS history_rows FROM site_settings WHERE is_current = 0`)
console.log(`历史版本行（is_current=0）：${history[0][0]}`)

const sample = await queryRows(target, `
SELECT setting_key, version, is_current FROM site_settings ORDER BY setting_key, version LIMIT 6`)
console.log('抽样：')
for (const row of sample) console.log(`  ${row[0]} version=${row[1]} is_current=${row[2]}`)
