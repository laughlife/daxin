// PUT /api/admin/review/{id}
//
// 人工核验：把一条待确认项置为 confirmed / rejected，可选地把确认值回填到业务表。
// 约定：
//   - 先校验管理员登录态与 review:write 权限；
//   - 状态只接受 confirmed / rejected，其余（含 open）一律 400；
//   - applyValue 只有在白名单内的「实体 + 字段」组合上才被接受（见 utils/admin/review-queries）；
//   - 回填目标行的解析是「唯一命中才写」：case 走 case_sources，
//     一个旧库来源可能对应多起案件（实测部分来源对应 2~14 起），命中不唯一时返回 409，
//     并且绝不改动核验项本身，避免把确认值写到错误的案件上；
//   - 回填与核验项更新在同一个事务里完成；
//   - 审计日志里的 entityId 固定为核验项 id，note 记录新状态与是否回填成功。
//
// 说明：本文件位于 server/api/admin/review/ 子目录（深度 3），
// `nuxt typecheck` 下相对路径 `../../utils/...` 无法解析（TS2307，同目录层级的
// articles/[id].*、media/[id].* 也一样），因此统一改用 Nitro 的 `#server/...` 别名。
import { type H3Event } from 'h3'
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { writeAuditLog } from '#server/utils/auth/audit'
import { queryTarget, withTargetTransaction } from '#server/utils/db/query'
import {
  applyCaseValue,
  mapReviewRow,
  normalizeResolvableStatus,
  resolveTargetStatement,
  validateApplyValue,
  type ApplyColumn,
  type ReviewRow,
} from '#server/utils/admin/review-queries'

/** resolution_note 与列宽一致（VARCHAR(512)）。 */
const MAX_NOTE_LENGTH = 512
const SELECT_COLUMNS = `id, entity_type, legacy_source_table, legacy_source_id, field_name,
         candidate_value, normalized_value, context_snippet, confidence, status,
         resolved_at, resolution_note`

type AppliedResult = { entity: 'case' | 'article'; id: number; column: string }
type ResolveOutcome =
  | { ok: true; entity: 'case' | 'article'; caseId: number; column: ApplyColumn }
  | { ok: false; status: number; code: string; message: string }

/** 把 requireAdmin 抛出的登录态/权限错误转成统一 JSON 响应。 */
function authErrorResponse(event: H3Event, error: unknown): { error: { code: string; message: string } } {
  const denied = (error as { statusCode?: number }).statusCode === 403
  setResponseStatus(event, denied ? 403 : 401)
  if (denied) return { error: { code: 'FORBIDDEN', message: '当前账号缺少核验队列写入权限' } }
  return { error: { code: 'UNAUTHORIZED', message: '未登录或登录已失效' } }
}

function parsePositiveInteger(value: unknown): number | null {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function readItemId(event: H3Event): number | null {
  return parsePositiveInteger(getRouterParam(event, 'id'))
}

async function readBodyRecord(event: H3Event): Promise<Record<string, unknown>> {
  try {
    const body = await readBody(event)
    return body && typeof body === 'object' ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function findReviewItem(id: number): Promise<ReviewRow | null> {
  const rows = await queryTarget<ReviewRow>(
    `SELECT ${SELECT_COLUMNS} FROM migration_review_items WHERE id = ? LIMIT 1`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * 解析 applyValue 的目标业务行。
 * 只有在恰好命中一行时才认为可以回填；命中 0 行或 >1 行都返回中文错误，由调用方转成 409。
 */
async function resolveApplyTarget(item: ReviewRow, column: ApplyColumn): Promise<ResolveOutcome> {
  const target = resolveTargetStatement({
    entityType: String(item.entity_type ?? ''),
    legacySourceTable: String(item.legacy_source_table ?? ''),
  })
  if (!target) {
    return { ok: false, status: 400, code: 'UNSUPPORTED_APPLY_ENTITY', message: '该类核验项不支持回填业务表' }
  }

  const params = [String(item.legacy_source_table ?? ''), Number(item.legacy_source_id ?? 0)]
  const rows = await queryTarget<{ id: number | string | null }>(target.sql, params)

  if (rows.length === 0) {
    return {
      ok: false,
      status: 409,
      code: 'TARGET_NOT_FOUND',
      message: '未找到该核验项对应的业务数据（旧库来源无法关联到案件或文章），已保留核验状态未变更',
    }
  }
  if (rows.length > 1) {
    return {
      ok: false,
      status: 409,
      code: 'TARGET_AMBIGUOUS',
      message: `该旧库来源对应 ${rows.length} 条业务数据，无法确定回填目标，请先在内容管理中手动处理，核验状态未变更`,
    }
  }

  const id = Number(rows[0]?.id ?? 0)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, status: 409, code: 'TARGET_NOT_FOUND', message: '未能确定回填目标的业务数据主键，核验状态未变更' }
  }
  return { ok: true, entity: target.entity, caseId: id, column }
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'review:write')
  } catch (error) {
    return authErrorResponse(event, error)
  }

  const itemId = readItemId(event)
  if (!itemId) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_ITEM_ID', message: '核验项 id 不合法' } }
  }

  const body = await readBodyRecord(event)
  const status = normalizeResolvableStatus(body.status)
  if (!status) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_STATUS', message: '核验状态只能是 confirmed 或 rejected' } }
  }

  const note = (typeof body.resolutionNote === 'string' ? body.resolutionNote.trim() : '').slice(0, MAX_NOTE_LENGTH)
  // 只要请求里出现了 applyValue 就进入白名单校验（显式 null 是 filed_at 的合法「清空」值）；
  // 字段整体缺省才表示本次不回填。
  const wantsApply = Object.hasOwn(body, 'applyValue')

  let item: ReviewRow | null
  try {
    item = await findReviewItem(itemId)
  } catch (error) {
    console.error('[admin-review] 读取核验项失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'REVIEW_READ_FAILED', message: '读取核验项失败，请稍后重试' } }
  }
  if (!item) {
    setResponseStatus(event, 404)
    return { error: { code: 'REVIEW_ITEM_NOT_FOUND', message: '核验项不存在或已被删除' } }
  }

  let resolved: ResolveOutcome | null = null
  let applyColumn: ApplyColumn | null = null
  let applyValue: string | null = null
  let applied: AppliedResult | false = false

  if (wantsApply) {
    const validation = validateApplyValue({
      entityType: item.entity_type,
      fieldName: item.field_name,
      applyValue: body.applyValue,
    })
    if (!validation.ok) {
      setResponseStatus(event, 400)
      return { error: { code: validation.code, message: validation.message } }
    }
    applyColumn = validation.column
    applyValue = validation.value

    try {
      resolved = await resolveApplyTarget(item, validation.column)
    } catch (error) {
      console.error('[admin-review] 解析回填目标失败', error)
      setResponseStatus(event, 500)
      return { error: { code: 'REVIEW_APPLY_FAILED', message: '解析回填目标失败，请稍后重试' } }
    }
    if (!resolved.ok) {
      setResponseStatus(event, resolved.status)
      return { error: { code: resolved.code, message: resolved.message } }
    }
  }

  try {
    await withTargetTransaction(async (connection) => {
      if (resolved && applyColumn) {
        await applyCaseValue(connection, {
          caseId: resolved.caseId,
          column: applyColumn,
          value: applyValue,
        })
      }
      await connection.execute(
        `UPDATE migration_review_items
            SET status = ?, resolved_by = ?, resolved_at = NOW(), resolution_note = ?, updated_at = NOW()
          WHERE id = ?`,
        [status, admin.id, note, itemId],
      )
    })
  } catch (error) {
    console.error('[admin-review] 更新核验项失败', error)
    setResponseStatus(event, 409)
    return { error: { code: 'REVIEW_WRITE_FAILED', message: '保存核验结果失败，请稍后重试' } }
  }

  if (resolved && applyColumn) {
    applied = { entity: resolved.entity, id: resolved.caseId, column: applyColumn }
  }

  let updated: ReviewRow | null
  try {
    updated = await findReviewItem(itemId)
  } catch (error) {
    console.error('[admin-review] 读取核验项失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'REVIEW_READ_FAILED', message: '核验项更新后读取失败，请稍后重试' } }
  }
  if (!updated) {
    setResponseStatus(event, 500)
    return { error: { code: 'REVIEW_READ_FAILED', message: '核验项更新后读取失败，请稍后重试' } }
  }

  try {
    await writeAuditLog({
      userId: admin.id,
      username: admin.username,
      action: 'review_resolve',
      entityType: 'review',
      entityId: itemId,
      ipDigest: getIpDigest(event),
      note: `核验项 ${itemId} 置为 ${status}；${applied ? `已回填 ${applied.entity}.${applied.column}` : '未回填业务数据'}`,
    })
  } catch (error) {
    // 审计写入失败不影响核验结果。
    console.error('[admin-review] 写入审计日志失败', error)
  }

  return { data: { item: mapReviewRow(updated), applied } }
})
