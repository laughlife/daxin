// 当 schema-check 因 web/.env 凭据过期无法连接时，用 login-path 手动应用单条迁移，
// 并按同样的规则写入 schema_migrations（version + sha256(文件内容)），保证与工具兼容。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const file = process.argv[2]
if (!file) {
  console.error('用法：node tools/apply-migration-manually.mjs <迁移文件路径>')
  process.exit(2)
}

const content = readFileSync(file, 'utf8')
const version = file.split(/[\\/]/).pop().replace(/\.sql$/, '')
const checksum = createHash('sha256').update(content).digest('hex')

const run = (sql) => execFileSync(MYSQL, [
  '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
  '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
  '--execute', sql,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// 1) 执行迁移本体
run(`USE daxin; ${content}`)
console.log(`✓ 已执行 ${version}`)

// 2) 登记（已存在则更新 checksum）
const esc = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
run(`USE daxin;
  INSERT INTO schema_migrations (version, checksum, applied_at)
  VALUES (${esc(version)}, ${esc(checksum)}, NOW())
  ON DUPLICATE KEY UPDATE checksum = VALUES(checksum);`)
console.log(`✓ 已登记 ${version}（checksum ${checksum.slice(0, 12)}…）`)
