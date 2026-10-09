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

/**
 * 允许在 NODE_ENV=production 下使用 root 的显式开关。
 *
 * 背景：`nuxt generate` / `nuxt build` 都会设置 NODE_ENV=production，因此本机用 root
 * 连接（web/.env 的默认本地配置）时，预渲染会因下面的 root 检查而失败，把「数据库错误」
 * 烘焙进静态产物。为了不阻断本地构建与预览，同时不放宽真实生产的默认约束：
 *   - 默认仍然禁止生产环境使用 root；
 *   - 只有显式设置 DAXIN_ALLOW_ROOT_DB=1（例如本地 build/generate）才放行，并打印一次告警。
 */
const ALLOW_ROOT_FLAG = 'DAXIN_ALLOW_ROOT_DB'

let warnedAboutRoot = false

const connection = (env: Environment, prefix: 'DB' | 'LEGACY_DB'): ConnectionConfig => {
  const config: ConnectionConfig = {
    host: required(env, `${prefix}_HOST`),
    port: port(env, `${prefix}_PORT`),
    user: required(env, `${prefix}_USER`),
    password: required(env, `${prefix}_PASSWORD`),
    database: required(env, `${prefix}_NAME`),
    charset: env[`${prefix}_CHARSET`]?.trim() || 'utf8mb4',
    connectionLimit: Number(env[`${prefix}_POOL_SIZE`] || '10'),
  }
  if (env.NODE_ENV === 'production' && config.user.toLowerCase() === 'root') {
    if (env[ALLOW_ROOT_FLAG] !== '1') {
      throw new Error(`生产环境禁止使用 root 数据库账号；本机构建或预览可显式设置 ${ALLOW_ROOT_FLAG}=1 放行`)
    }
    if (!warnedAboutRoot) {
      warnedAboutRoot = true
      console.warn(`[db-config] 已通过 ${ALLOW_ROOT_FLAG}=1 放行生产环境 root 账号，请勿在正式环境这样部署`)
    }
  }
  return config
}

/** 目标业务库配置；业务读写只需要这一个。 */
export function getTargetDbConfig(
  env: Environment = ((globalThis as { process?: { env?: Environment } }).process?.env || {}),
): ConnectionConfig {
  return connection(env, 'DB')
}

/**
 * 旧库配置；只在迁移或只读核查时使用。
 * 单独暴露是因为旧库连接并非运行时必需：未配置 LEGACY_DB_* 时，
 * 网站与后台仍应能正常访问目标库，而不是在启动或首次查询时整体失败。
 */
export function getLegacyDbConfig(
  env: Environment = ((globalThis as { process?: { env?: Environment } }).process?.env || {}),
): ConnectionConfig {
  return connection(env, 'LEGACY_DB')
}

export function getDbConfig(
  env: Environment = ((globalThis as { process?: { env?: Environment } }).process?.env || {}),
): DbConfig {
  const target = getTargetDbConfig(env)
  // 旧库配置延迟到真正读取时才校验，避免未配置旧库时阻断业务库访问。
  let legacyCache: ConnectionConfig | undefined
  return {
    targetName: target.database,
    get legacyName(): string {
      try {
        return (legacyCache ??= getLegacyDbConfig(env)).database
      } catch {
        return ''
      }
    },
    target,
    get legacy(): ConnectionConfig {
      return (legacyCache ??= getLegacyDbConfig(env))
    },
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
