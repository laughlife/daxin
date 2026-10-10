// 后台内容接口共用的响应与请求体助手。
//
// 只做三件事：把 requireAdmin 抛出的登录态/权限错误转成统一中文响应、统一失败响应格式、
// 安全读取 JSON 请求体。不包含任何业务规则（业务规则都在 utils/admin/content-queries.ts）。
import { readBody, setResponseStatus, type H3Event } from 'h3'
import { writeAuditLog, type AuditLogInput } from '../auth/audit'
import { queryTarget } from '../db/query'

export interface AdminErrorBody {
  error: { code: string; message: string }
}

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应（403 / 401）。 */
export function adminAuthError(event: H3Event, error: unknown, deniedMessage: string): AdminErrorBody {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: deniedMessage } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

/** 统一失败响应：setResponseStatus + { error: { code, message } }（中文提示）。 */
export function fail(event: H3Event, status: number, code: string, message: string): AdminErrorBody {
  setResponseStatus(event, status)
  return { error: { code, message } }
}

/** 读取 JSON 请求体；缺失 / 非法 JSON 一律按空对象处理，由调用方逐字段校验。 */
export async function readAdminBody(event: H3Event): Promise<Record<string, unknown>> {
  let body: unknown = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
}

/** 审计写入失败不影响业务操作，统一在此吞掉并打印。 */
export async function writeAuditSafely(input: AuditLogInput): Promise<void> {
  try {
    await writeAuditLog(input)
  } catch (error) {
    console.error('[admin-content] 写入审计日志失败', error)
  }
}

/** 写操作结果头；queryTarget 对 INSERT/UPDATE 返回的是 mysql2 结果头而不是行数组。 */
export interface WriteResult {
  insertId: number
  affectedRows: number
}

/** 执行写语句并取出结果头（insertId / affectedRows）。 */
export async function executeWrite(sql: string, params: unknown[]): Promise<WriteResult> {
  const header = await queryTarget(sql, params) as unknown as { insertId?: unknown; affectedRows?: unknown }
  return {
    insertId: Number(header?.insertId ?? 0),
    affectedRows: Number(header?.affectedRows ?? 0),
  }
}

/** 唯一键冲突（例如 slug / case_number 并发写入撞车）。 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string }).code === 'ER_DUP_ENTRY'
}
