export type Environment = Record<string, string | undefined>

export type DbConfig = {
  targetName: string
  legacyName: string
  target: ConnectionConfig
  legacy: ConnectionConfig
}

export type ConnectionConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  charset: string
  connectionLimit: number
}

const required = (env: Environment, key: string): string => {
  const value = env[key]?.trim()
  if (!value) throw new Error(`缺少数据库环境变量 ${key}`)
  return value
}

const port = (env: Environment, key: string): number => {
  const raw = env[key]?.trim() || '3306'
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${key} 必须是有效端口`)
  }
  return value
}

const connection = (env: Environment, prefix: 'DB' | 'LEGACY_DB'): ConnectionConfig => ({
  host: required(env, `${prefix}_HOST`),
  port: port(env, `${prefix}_PORT`),
  user: required(env, `${prefix}_USER`),
  password: required(env, `${prefix}_PASSWORD`),
  database: required(env, `${prefix}_NAME`),
  charset: env[`${prefix}_CHARSET`]?.trim() || 'utf8mb4',
  connectionLimit: Number(env[`${prefix}_POOL_SIZE`] || '10'),
})

export function getDbConfig(env: Environment = ((globalThis as { process?: { env?: Environment } }).process?.env || {})) : DbConfig {
  const target = connection(env, 'DB')
  const legacy = connection(env, 'LEGACY_DB')
  if (env.NODE_ENV === 'production' && target.user.toLowerCase() === 'root') {
    throw new Error('生产环境禁止使用 root 数据库账号')
  }
  return {
    targetName: target.database,
    legacyName: legacy.database,
    target,
    legacy,
  }
}

export function assertReadOnlySql(sql: string): void {
  const normalized = sql.trim().replace(/^\uFEFF/, '')
  if (!/^SELECT\b/i.test(normalized) || /;\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(normalized)) {
    throw new Error('旧库查询只允许 SELECT 语句')
  }
}

export function assertParameterizedSql(sql: string, params: unknown[]): void {
  if (!Array.isArray(params)) throw new Error('查询参数必须是数组')
  if (params.length > 0 && !sql.includes('?')) {
    throw new Error('带参数查询必须使用占位符参数化')
  }
}
