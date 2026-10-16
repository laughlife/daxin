// 迁移工具共用的只读 MySQL 客户端。
//
// 只通过本机 mysql 命令行客户端执行语句，不引入 Node MySQL 驱动依赖，
// 也不使用 web 项目的连接池，保证迁移脚本与运行时完全隔离。
import { spawn } from 'node:child_process'
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
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(connection.client, args, {
      windowsHide: true,
      env: connection.password ? { ...process.env, MYSQL_PWD: connection.password } : process.env,
    })
    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error(`执行超时（${timeoutMs}ms）`))
    }, timeoutMs)
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) rejectPromise(error)
      else resolvePromise(value)
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      outputBytes += Buffer.byteLength(chunk)
      if (outputBytes > stdoutLimit) {
        child.kill()
        finish(new Error(`mysql 输出超过 ${stdoutLimit} bytes`))
        return
      }
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => finish(new Error(`mysql 启动失败：${error.message}`)))
    child.on('close', (code) => {
      if (settled) return
      const detail = stderr.trim()
      if (code !== 0) {
        finish(new Error(`mysql 执行失败（库 ${database ?? connection.database}）：${(detail || `exit ${code}`).slice(0, 600)}`))
      } else if (detail && /error/i.test(detail)) {
        finish(new Error(`mysql 报告错误：${detail.slice(0, 600)}`))
      } else finish(null, stdout)
    })
    child.stdin.on('error', (error) => finish(new Error(`mysql 输入失败：${error.message}`)))
    child.stdin.end(sql)
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

/**
 * 并发执行多条写入语句。
 *
 * 每篇文章的写入都是幂等的 INSERT ... ON DUPLICATE KEY UPDATE，彼此不依赖，
 * 因此可以并发执行；串行执行 288 篇文章会产生数千次往返，实测需要数十分钟。
 * 并发度默认 8，避免本机 MySQL 连接数被打满。
 */
export function chunkSqlStatements(statements, { maxBytes = 2 * 1024 * 1024, maxStatements = 100 } = {}) {
  const chunks = []
  let current = []
  let currentBytes = 0
  for (const statement of statements.filter(Boolean)) {
    const statementBytes = Buffer.byteLength(statement, 'utf8') + 2
    if (current.length && (currentBytes + statementBytes > maxBytes || current.length >= maxStatements)) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(statement)
    currentBytes += statementBytes
  }
  if (current.length) chunks.push(current)
  return chunks
}

export async function executeSqlBatch(connection, statements, { concurrency = 8, maxBatchBytes, maxBatchStatements, ...options } = {}) {
  const list = statements.filter(Boolean)
  const chunks = chunkSqlStatements(list, { maxBytes: maxBatchBytes, maxStatements: maxBatchStatements })
  const errors = []
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, chunks.length)) }, async () => {
    while (cursor < chunks.length) {
      const index = cursor
      cursor += 1
      try {
        await executeSql(connection, `${chunks[index].map((statement) => `${statement.replace(/;\s*$/, '')};`).join('\n')}\n`, options)
      } catch (error) {
        errors.push(`语句批次 #${index} 失败（${chunks[index].length} 条）：${error.message}`)
      }
    }
  })
  await Promise.all(workers)
  if (errors.length > 0) {
    throw new Error(`批量写入失败 ${errors.length} 组，首组：${errors[0]}`)
  }
}

/**
 * 并发执行多个返回单值的查询，并保持与输入相同的顺序。
 * 用于批量取出刚写入记录的主键，避免逐条 SELECT。
 */
export async function queryRowsBatch(connection, queries, { concurrency = 8, ...options } = {}) {
  const results = new Array(queries.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queries.length)) }, async () => {
    while (cursor < queries.length) {
      const index = cursor
      cursor += 1
      results[index] = await queryRows(connection, queries[index], options)
    }
  })
  await Promise.all(workers)
  return results
}

export function quoteLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}
