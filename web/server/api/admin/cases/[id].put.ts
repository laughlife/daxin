// PUT /api/admin/cases/[id]
//
// 更新案例。约定：
//   - 只接受白名单字段（caseNumber / filedAt / plaintiff / court / title / summary / status / publishStatus）
//     以及关联 brandId / lawFirmId / ipTypeId；请求体里的其它键（legacy_*、migration_batch_id、verified_at）一律忽略；
//   - 只改请求里显式给出的字段；关联采用「按 id 覆盖式替换」，undefined 不碰、null 清空；
//   - 改 caseNumber 时同步重算 case_year / case_seq / case_type，避免派生列与案件号不一致；
//   - 侵权类型只写 case_ip_types：公开接口的 caseType 由该关联 + ip_types.slug 推导（unknown 落回空串）；
//   - 主体与关联在同一个事务里写入；
//   - 审计 action：case_update，before / after 只包含真正变化的字段（含关联 id）。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget, withTargetTransaction } from '#server/utils/db/query'
import {
  ADMIN_CASE_DETAIL_SQL,
  CASE_RELATION_TARGETS,
  CASE_WRITABLE_COLUMNS,
  buildCaseRelationStatements,
  buildUpdateStatement,
  hasOwn,
  mapAdminCaseDetail,
  normalizeCaseNumber,
  parseCaseNumberParts,
  parseCaseRelations,
  parseCaseStatus,
  parseDateInput,
  parsePublishStatus,
  pickChangedFields,
  readCaseStatus,
  readPublishStatus,
  toDateText,
  toRouteId,
  toText,
  type AdminCaseRow,
  type CaseRelationInput,
} from '#server/utils/admin/content-queries'
import {
  adminAuthError,
  fail,
  isDuplicateKeyError,
  readAdminBody,
  writeAuditSafely,
} from '#server/utils/admin/http'

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'case:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')

  const body = await readAdminBody(event)

  try {
    const currentRows = await queryTarget<AdminCaseRow>(ADMIN_CASE_DETAIL_SQL, [id])
    const current = currentRows[0]
    if (!current) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')

    const changes: Record<string, unknown> = {}
    const before: Record<string, unknown> = {
      case_number: toText(current.case_number),
      filed_at: toDateText(current.filed_at),
      plaintiff: toText(current.plaintiff),
      court: toText(current.court),
      title: toText(current.title),
      summary: toText(current.summary),
      status: readCaseStatus(current.status),
      publish_status: readPublishStatus(current.publish_status),
    }

    if (hasOwn(body, 'caseNumber')) {
      const caseNumber = normalizeCaseNumber(body.caseNumber)
      if (!caseNumber) {
        return fail(event, 400, 'INVALID_CASE_NUMBER', '案件号格式不正确，应为 24-cv-0006 这样的形式')
      }
      if (caseNumber !== before.case_number) {
        const duplicated = await queryTarget<{ id: number }>(
          'SELECT id FROM cases WHERE case_number = ? AND id <> ? LIMIT 1',
          [caseNumber, id],
        )
        if (duplicated[0]) return fail(event, 409, 'CASE_NUMBER_EXISTS', '案件号已存在')
        const parts = parseCaseNumberParts(caseNumber)
        if (!parts) return fail(event, 400, 'INVALID_CASE_NUMBER', '案件号格式不正确，应为 24-cv-0006 这样的形式')
        changes.case_number = caseNumber
        changes.case_year = parts.caseYear
        changes.case_seq = parts.caseSeq
        changes.case_type = parts.caseType
      }
    }

    if (hasOwn(body, 'filedAt')) {
      const parsed = parseDateInput(body.filedAt)
      if (!parsed.ok) return fail(event, 400, 'INVALID_FILED_AT', '起诉时间格式不正确，应为 YYYY-MM-DD')
      changes.filed_at = parsed.value
    }

    if (hasOwn(body, 'plaintiff')) changes.plaintiff = toText(body.plaintiff)
    if (hasOwn(body, 'court')) changes.court = toText(body.court)
    if (hasOwn(body, 'title')) changes.title = toText(body.title)
    if (hasOwn(body, 'summary')) changes.summary = toText(body.summary)

    if (hasOwn(body, 'status')) {
      const status = parseCaseStatus(body.status, 'open')
      if (!status) return fail(event, 400, 'INVALID_STATUS', '内部状态只能是 open、closed 或 archived')
      changes.status = status
    }

    if (hasOwn(body, 'publishStatus')) {
      const publishStatus = parsePublishStatus(body.publishStatus, 'draft')
      if (!publishStatus) {
        return fail(event, 400, 'INVALID_PUBLISH_STATUS', '发布状态只能是 draft、published 或 archived')
      }
      changes.publish_status = publishStatus
    }

    const relations = parseCaseRelations(body)
    if (!relations.ok) return fail(event, 400, 'INVALID_RELATION', `关联参数不正确：${relations.field}`)

    const relationError = await validateRelations(relations.relations)
    if (relationError) return fail(event, 400, 'INVALID_RELATION', relationError)

    const detail = mapAdminCaseDetail(current)
    const after: Record<string, unknown> = { ...changes }
    if (relations.relations.brandId !== undefined) {
      before.brandId = detail.brandId
      after.brandId = relations.relations.brandId
    }
    if (relations.relations.lawFirmId !== undefined) {
      before.lawFirmId = detail.lawFirmId
      after.lawFirmId = relations.relations.lawFirmId
    }
    if (relations.relations.ipTypeId !== undefined) {
      before.ipTypeId = detail.ipTypeId
      after.ipTypeId = relations.relations.ipTypeId
    }

    const statement = buildUpdateStatement('cases', id, changes, CASE_WRITABLE_COLUMNS)
    const relationStatements = buildCaseRelationStatements(id, relations.relations)

    if (statement || relationStatements.length > 0) {
      await withTargetTransaction(async (connection) => {
        if (statement) await connection.execute(statement.sql, statement.params)
        for (const item of relationStatements) {
          await connection.execute(item.sql, item.params)
        }
      })
      const changed = pickChangedFields(before, after)
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'case_update',
        entityType: 'case',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: `更新案例字段：${Object.keys(changed.after).join(', ') || '无'}`,
        before: changed.before,
        after: changed.after,
      })
    }

    const rows = await queryTarget<AdminCaseRow>(ADMIN_CASE_DETAIL_SQL, [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'CASE_NOT_FOUND', '案例不存在')
    return { data: { case: mapAdminCaseDetail(row) } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'CASE_NUMBER_EXISTS', '案件号已存在')
    console.error('[admin-cases] 更新案例失败', error)
    return fail(event, 500, 'CASE_UPDATE_FAILED', '案例更新失败，请稍后重试')
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
