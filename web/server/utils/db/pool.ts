import { getDbConfig, type ConnectionConfig } from './config'

type SqlResult = [rows: unknown, fields?: unknown]
type SqlPool = {
  execute(sql: string, params: unknown[]): Promise<SqlResult>
  getConnection(): Promise<SqlConnection>
  end(): Promise<void>
}
type SqlConnection = {
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  execute(sql: string, params: unknown[]): Promise<SqlResult>
  release(): void
}

let targetPool: Promise<SqlPool> | undefined
let legacyPool: Promise<SqlPool> | undefined

async function loadMysql(): Promise<{ createPool(options: ConnectionConfig): SqlPool }> {
  try {
    const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ createPool(options: ConnectionConfig): SqlPool }>
    return await importer('mysql2/promise')
  } catch {
    throw new Error('未安装 mysql2 依赖，请在部署环境执行 npm install')
  }
}

async function createPool(config: ConnectionConfig): Promise<SqlPool> {
  const mysql = await loadMysql()
  return mysql.createPool(config)
}

export function getTargetPool(): Promise<SqlPool> {
  return targetPool ||= createPool(getDbConfig().target)
}

export function getLegacyPool(): Promise<SqlPool> {
  return legacyPool ||= createPool(getDbConfig().legacy)
}

export async function closeDbPools(): Promise<void> {
  const pools = await Promise.all([targetPool, legacyPool].filter(Boolean) as Promise<SqlPool>[])
  await Promise.all(pools.map((pool) => pool.end()))
  targetPool = undefined
  legacyPool = undefined
}

export type { SqlConnection, SqlPool, SqlResult }
