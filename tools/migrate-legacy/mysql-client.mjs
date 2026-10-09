// 迁移工具共用的只读 MySQL 客户端。
//
// 只通过本机 mysql 命令行客户端执行语句，不引入 Node MySQL 驱动依赖，
// 也不使用 web 项目的连接池，保证迁移脚本与运行时完全隔离。
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..')
export const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')

const DEFAULT_CLIENTS = [
  'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe',
  '/usr/bin/mysql',
  '/usr/local/bin/mysql',
]

export function findMysqlClient() {
  if (process.env.DAXIN_MYSQL_CLIENT) return process.env.DAXIN_MYSQL_CLIENT
  for (const candidate of DEFAULT_CLIENTS) {
    if (existsSync(candidate)) return candidate
  }
  return 'mysql'
}

/** 读取 web/.env 的键值，仅用于本地连接参数；不打印任何值。 */
export function readEnvFile(path = join(REPO_ROOT, 'web', '.env')) {
  if (!existsSync(path)) return {}
  const values = {}
  let content = ''
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function findMysqlLoginPath(env) {
  if (env.DAXIN_MYSQL_LOGIN_PATH) return env.DAXIN_MYSQL_LOGIN_PATH
  const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const credentials = join(appData, 'MySQL', '.mylogin.cnf')
  return existsSync(credentials) ? (env.DAXIN_MYSQL_LOGIN_NAME || 'daxin') : ''
}

/**
 * 解析数据库连接。
 * prefix 为空时读取 DB_*；prefix 为 'LEGACY_' 时读取 LEGACY_DB_*。
 *
 * LEGACY_* 未配置时会按 design 约定回退到同一实例：
 * 沿用 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD，库名回退为 LEGACY_DB_NAME 的默认值 da。
 * 需要独立只读账号时，在 web/.env 填写完整的 LEGACY_DB_* 即可覆盖该回退。
 */
export function resolveConnection({ prefix = '', fallbackDatabase = '', repoRoot = REPO_ROOT, env = process.env } = {}) {
  const fileValues = readEnvFile(join(repoRoot, 'web', '.env'))
  const pick = (name) => env[`${prefix}${name}`] || fileValues[`${prefix}${name}`] || ''
  const fallback = (name) => env[name] || fileValues[name] || ''
  const useFallback = prefix !== '' && !pick('DB_NAME')
  const value = (name) => (useFallback ? fallback(name) : pick(name))
  const database = pick('DB_NAME') || (useFallback ? fallbackDatabase : '')
  if (!database) return null
  const password = value('DB_PASSWORD')
  const base = {
    client: findMysqlClient(),
    host: value('DB_HOST') || '127.0.0.1',
    port: value('DB_PORT') || '3306',
    user: value('DB_USER'),
    password,
    database,
    loginPath: '',
    auth: '',
    credentialSource: useFallback ? 'DB_* 回退' : `${prefix}DB_*`,
  }
  if (base.user && base.password) return { ...base, auth: 'password' }
  const loginPath = findMysqlLoginPath(env)
  if (loginPath) return { ...base, user: base.user || 'root', loginPath, auth: 'login-path', password: '' }
  return null
}

/** 目标业务库连接（DB_*）。 */
export function resolveTargetConnection(options = {}) {
  return resolveConnection({ ...options, prefix: '' })
}

/** 旧库连接（LEGACY_DB_*，未配置时按约定回退到 DB_* + da）。 */
export function resolveLegacyConnection(options = {}) {
  return resolveConnection({ ...options, prefix: 'LEGACY_', fallbackDatabase: 'da' })
}

function buildArgs(connection, { database, batch }) {
  const args = [
    ...(connection.loginPath ? [`--login-path=${connection.loginPath}`] : []),
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--user=${connection.user}`,
    '--connect-timeout=5',
    '--default-character-set=utf8mb4',
  ]
  if (batch) args.push('--batch')
  if (database) args.push(`--database=${database}`)
  return args
}

function execute(connection, sql, { database, timeoutMs, stdoutLimit, batch = true, skipColumnNames = true }) {
  const args = buildArgs(connection, { database: database === undefined ? connection.database : database, batch })
  if (batch && skipColumnNames) args.push('--skip-column-names')
  args.push(`--execute=${sql}`)
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(connection.client, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: stdoutLimit,
      env: connection.password ? { ...process.env, MYSQL_PWD: connection.password } : process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(`mysql 执行失败（库 ${database ?? connection.database}）：${(stderr || error.message).trim().slice(0, 600)}`))
        return
      }
      const warnings = String(stderr).trim()
      if (warnings && /error/i.test(warnings)) {
        rejectPromise(new Error(`mysql 报告错误：${warnings.slice(0, 600)}`))
        return
      }
      resolvePromise(String(stdout))
    })
  })
}

/** 执行查询并返回二维数组。 */
export async function queryRows(connection, sql, options = {}) {
  const stdout = await execute(connection, sql, {
    timeoutMs: 60000,
    stdoutLimit: 64 * 1024 * 1024,
    ...options,
  })
  return stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => line.split('\t'))
}

/** 执行查询并返回对象数组；要求列名唯一，且列名不得重复。 */
export async function queryObjects(connection, sql, options = {}) {
  const stdout = await execute(connection, sql, {
    timeoutMs: 120000,
    stdoutLimit: 128 * 1024 * 1024,
    skipColumnNames: false,
    ...options,
  })
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const values = line.split('\t')
    const row = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    return row
  })
}

/** 执行写入或 DDL 语句；返回空。 */
export async function executeSql(connection, sql, options = {}) {
  await execute(connection, sql, { timeoutMs: 180000, stdoutLimit: 4 * 1024 * 1024, ...options })
}

export function quoteLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}
