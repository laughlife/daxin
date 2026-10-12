// 核对 schema_migrations 台账里记录的 checksum 是否与磁盘上的迁移文件一致。
//
// 为什么需要：applyMigrations 在「该版本已存在台账记录」时会直接跳过，
// **不会**比较 checksum。因此若在迁移已应用后又修改了该迁移文件，
// 文件与数据库就会静默不一致——后续重建环境时会执行到另一套 SQL，
// 而当前库并不会被更新。这是一类容易被忽略的漂移。
//
// 用法：node tools/check-migration-ledger.mjs [--fix]
//   --fix  用磁盘文件的实际 checksum 更新台账（仅用于确认数据库已符合最新文件的情况）
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'
import { loadMigrationFiles } from './migrate-legacy/schema-check.mjs'

const fix = process.argv.includes('--fix')
const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exitCode = 2
} else {
  const files = await loadMigrationFiles()
  const ledgerRows = await queryRows(target, 'SELECT version, checksum FROM schema_migrations')
  const ledger = new Map(ledgerRows.map((row) => [String(row[0]), String(row[1])]))

  let mismatched = 0
  let missing = 0
  console.log('迁移文件与台账核对：')
  for (const file of files) {
    const version = file.name.replace(/\.sql$/i, '')
    const checksum = createHash('sha256').update(file.content).digest('hex')
    const recorded = ledger.get(version)

    if (recorded === undefined) {
      console.log(`  ? ${version} 尚未应用`)
      missing += 1
      continue
    }
    if (recorded === checksum) {
      console.log(`  ✔ ${version} 一致`)
      continue
    }
    console.log(`  ✖ ${version} checksum 不一致（文件已改动但未重新应用）`)
    console.log(`      台账=${recorded.slice(0, 16)}…  文件=${checksum.slice(0, 16)}…`)
    mismatched += 1
    if (fix) {
      await executeSql(target, `UPDATE schema_migrations SET checksum = ${quoteLiteral(checksum)} WHERE version = ${quoteLiteral(version)}`)
      console.log('      已更新台账 checksum（请确认数据库结构确实已符合该文件）')
    }
  }

  console.log(`\n合计：${files.length} 个迁移文件，checksum 不一致 ${mismatched}，未应用 ${missing}`)
  if (mismatched > 0 && !fix) {
    console.log('如已确认数据库结构符合最新文件，可用 --fix 同步台账。')
    process.exitCode = 1
  }
}
