// 后台操作审计日志。
//
// 约定：
//   - before/after 统一 JSON.stringify 后写入 JSON 列，缺省写 NULL；
//   - 调用方需自行保证快照已脱敏，禁止写入密码、令牌等凭据；
//   - 审计写入失败不应回滚业务操作，调用方按需 try/catch。
import { queryTarget } from '../db/query'

export type AuditLogInput = {
  userId?: number | null
  username?: string | null
  action: string
  entityType?: string | null
  entityId?: number | null
  before?: unknown
  after?: unknown
  ipDigest?: string | null
  note?: string | null
}

const ACTION_MAX_LENGTH = 64
const USERNAME_MAX_LENGTH = 64
const ENTITY_TYPE_MAX_LENGTH = 48
const IP_DIGEST_MAX_LENGTH = 64
const NOTE_MAX_LENGTH = 512

function limit(value: unknown, maxLength: number): string {
  return String(value ?? '').slice(0, maxLength)
}

/** 序列化变更快照；不可序列化时按 NULL 写入，避免影响主流程。 */
function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

/** 写入一条审计日志。 */
export async function writeAuditLog({
  userId = null,
  username = '',
  action,
  entityType = '',
  entityId = null,
  before = null,
  after = null,
  ipDigest = '',
  note = '',
}: AuditLogInput): Promise<void> {
  await queryTarget(
    `INSERT INTO admin_audit_logs
       (user_id, username, action, entity_type, entity_id, before_json, after_json, ip_digest, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      userId,
      limit(username, USERNAME_MAX_LENGTH),
      limit(action, ACTION_MAX_LENGTH),
      limit(entityType, ENTITY_TYPE_MAX_LENGTH),
      entityId,
      toJson(before),
      toJson(after),
      limit(ipDigest, IP_DIGEST_MAX_LENGTH),
      limit(note, NOTE_MAX_LENGTH),
    ],
  )
}
