// POST /api/admin/cases
//
// 新建案例。约定：
//   - 先校验 case:write 权限，再做任何查库；
//   - caseNumber 必须是 `^\d{2}-[a-z]{2}-\d+$`（大小写不敏感，入库统一小写）且唯一；
//     case_year / case_seq / case_type 由案件号派生后一起写入，保证派生列与案件号一致；
//   - publishStatus 只接受 draft|published|archived（默认 draft），status 内部状态只接受 open|closed|archived（默认 open）；
//   - brandId / lawFirmId / ipTypeId 写的是关联表（case_brands / case_law_firms / case_ip_types），
//     侵权类型绝不存到 cases 表：公开接口的 caseType 由 case_ip_types + ip_types.slug 推导；
//   - 主体与关联在同一个事务里写入，关联失败不会留下半个案例；
//   - 审计 action：case_create。
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { queryTarget, withTargetTransaction } from '../../utils/db/query'
import {
  ADMIN_CASE_DETAIL_SQL,
  CASE_RELATION_TARGETS,
  buildCaseRelationStatements,
  hasOwn,
  mapAdminCaseDetail,
  normalizeCaseNumber,
  parseCaseNumberParts,
  parseCaseStatus,
  parseCaseRelations,
  parseDateInput,
  parsePublishStatus,
  toText,
  type AdminCaseRow,
  type CaseRelationInput,
} from '../../utils/admin/content-queries'
import {
  adminAuthError,
  fail,
  isDuplicateKeyError,
  readAdminBody,
  writeAuditSafely,
} from '../../utils/admin/http'

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'case:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例写入权限')
  }

  const body = await readAdminBody(event)

  const caseNumber = normalizeCaseNumber(body.caseNumber)
  if (!caseNumber) {
    return fail(event, 400, 'INVALID_CASE_NUMBER', '案件号格式不正确，应为 24-cv-0006 这样的形式')
  }
  const parts = parseCaseNumberParts(caseNumber)
  if (!parts) return fail(event, 400, 'INVALID_CASE_NUMBER', '案件号格式不正确，应为 24-cv-0006 这样的形式')

  const publishStatus = parsePublishStatus(hasOwn(body, 'publishStatus') ? body.publishStatus : undefined)
  if (publishStatus === null) {
    return fail(event, 400, 'INVALID_PUBLISH_STATUS', '发布状态只能是 draft、published 或 archived')
  }

  const status = parseCaseStatus(hasOwn(body, 'status') ? body.status : undefined)
  if (status === null) return fail(event, 400, 'INVALID_STATUS', '内部状态只能是 open、closed 或 archived')

  let filedAt: string | null = null
  if (hasOwn(body, 'filedAt')) {
    const parsed = parseDateInput(body.filedAt)
    if (!parsed.ok) return fail(event, 400, 'INVALID_FILED_AT', '起诉时间格式不正确，应为 YYYY-MM-DD')
    filedAt = parsed.value
  }

  const relations = parseCaseRelations(body)
  if (!relations.ok) return fail(event, 400, 'INVALID_RELATION', `关联参数不正确：${relations.field}`)

  try {
    const duplicated = await queryTarget<{ id: number }>('SELECT id FROM cases WHERE case_number = ? LIMIT 1', [caseNumber])
    if (duplicated[0]) return fail(event, 409, 'CASE_NUMBER_EXISTS', '案件号已存在')

    const relationError = await validateRelations(relations.relations)
    if (relationError) return fail(event, 400, 'INVALID_RELATION', relationError)

    const plaintiff = toText(body.plaintiff)
    const court = toText(body.court)
    const title = toText(body.title)
    const summary = toText(body.summary)

    const caseId = await withTargetTransaction(async (connection) => {
      const [header] = await connection.execute(
        `INSERT INTO cases
           (case_number, case_year, case_seq, case_type, filed_at, plaintiff, court, title, summary,
            status, publish_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [caseNumber, parts.caseYear, parts.caseSeq, parts.caseType, filedAt, plaintiff, court, title, summary, status, publishStatus],
      )
      const insertId = Number((header as { insertId?: unknown })?.insertId ?? 0)
      for (const statement of buildCaseRelationStatements(insertId, relations.relations)) {
        await connection.execute(statement.sql, statement.params)
      }
      return insertId
    })

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'case_create',
      entityType: 'case',
      entityId: caseId,
      ipDigest: getIpDigest(event),
      note: '新建案例',
      after: {
        caseNumber,
        filedAt,
        plaintiff,
        court,
        title,
        summary,
        status,
        publishStatus,
        brandId: relations.relations.brandId ?? null,
        lawFirmId: relations.relations.lawFirmId ?? null,
        ipTypeId: relations.relations.ipTypeId ?? null,
      },
    })

    const rows = await queryTarget<AdminCaseRow>(ADMIN_CASE_DETAIL_SQL, [caseId])
    const row = rows[0]
    if (!row) return { data: { id: caseId, caseNumber } }
    return { data: { case: mapAdminCaseDetail(row) } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'CASE_NUMBER_EXISTS', '案件号已存在')
    console.error('[admin-cases] 新建案例失败', error)
    return fail(event, 500, 'CASE_CREATE_FAILED', '案例创建失败，请稍后重试')
  }
})

/**
 * 校验关联目标真实存在；返回中文错误信息，全部通过时返回空串。
 * 放在 handler 之后定义：函数声明会提升，同时保证文件里第一次出现的数据库调用位于
 * requireAdmin 之后（见 web/scripts/admin-content.test.mjs 的静态守卫）。
 */
async function validateRelations(relations: CaseRelationInput): Promise<string> {
  for (const { field, targetTable, label } of CASE_RELATION_TARGETS) {
    const value = relations[field as keyof CaseRelationInput]
    if (value === undefined || value === null) continue
    const rows = await queryTarget<{ id: number }>(`SELECT id FROM ${targetTable} WHERE id = ? LIMIT 1`, [value])
    if (!rows[0]) return `${label}不存在`
  }
  return ''
}
