import { assertParameterizedSql, assertReadOnlySql } from './config'
import { getLegacyPool, getTargetPool, type SqlConnection } from './pool'

export async function queryTarget<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  assertParameterizedSql(sql, params)
  const [rows] = await (await getTargetPool()).execute(sql, params)
  return rows as T[]
}

export async function queryLegacy<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  assertReadOnlySql(sql)
  assertParameterizedSql(sql, params)
  const [rows] = await (await getLegacyPool()).execute(sql, params)
  return rows as T[]
}

export async function withTargetTransaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T> {
  const connection = await (await getTargetPool()).getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
