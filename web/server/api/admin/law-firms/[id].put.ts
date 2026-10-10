// PUT /api/admin/law-firms/[id]
//
// 更新律所。只接受白名单字段（slug、name、nameEn、aliases、region、summary、status），
// 请求体里的 caseCount 是只读派生值，即使传了也**直接忽略**。
// 只改显式给出的字段，未提供的保持不变。
// 审计 action：law_firm_update，before / after 只包含真正变化的字段。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { escapeLikePattern } from '#server/utils/public/article-query'
import {
  LAW_FIRM_WRITABLE_COLUMNS,
  adminEntityDetailSql,
  buildUpdateStatement,
  ensureUniqueSlug,
  hasOwn,
  mapAdminEntityRow,
  parseEntityStatus,
  pickChangedFields,
  slugifyTitle,
  toRouteId,
  toText,
  type AdminEntityRow,
} from '#server/utils/admin/content-queries'
import {
  adminAuthError,
  executeWrite,
  fail,
  isDuplicateKeyError,
  readAdminBody,
  writeAuditSafely,
} from '#server/utils/admin/http'

const MAX_SLUG_LENGTH = 191

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'law_firm:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少律所写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')

  const body = await readAdminBody(event)

  try {
    const currentRows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('law_firms'), [id])
    const currentRow = currentRows[0]
    if (!currentRow) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')
    const current = mapAdminEntityRow(currentRow)

    const changes: Record<string, unknown> = {}
    const before: Record<string, unknown> = {
      slug: current.slug,
      name: current.name,
      name_en: current.nameEn,
      aliases: current.aliases,
      region: current.region,
      summary: current.summary,
      status: current.status,
    }

    if (hasOwn(body, 'name')) {
      const name = toText(body.name)
      if (!name) return fail(event, 400, 'INVALID_NAME', '律所名称不能为空')
      changes.name = name
    }
    if (hasOwn(body, 'nameEn')) changes.name_en = toText(body.nameEn)
    if (hasOwn(body, 'aliases')) changes.aliases = toText(body.aliases)
    if (hasOwn(body, 'region')) changes.region = toText(body.region)
    if (hasOwn(body, 'summary')) changes.summary = toText(body.summary)

    if (hasOwn(body, 'status')) {
      const status = parseEntityStatus(body.status, 1)
      if (status === null) return fail(event, 400, 'INVALID_STATUS', '律所状态只能是 1（正常）或 0（归档）')
      changes.status = status
    }

    if (hasOwn(body, 'slug')) {
      const requested = slugifyTitle(toText(body.slug)).slice(0, MAX_SLUG_LENGTH)
      if (!requested) return fail(event, 400, 'INVALID_SLUG', '律所标识不能为空')
      if (requested !== current.slug) {
        const existing = await queryTarget<{ slug: string }>(
          `SELECT slug FROM law_firms WHERE slug LIKE ? ESCAPE '!' AND id <> ?`,
          [`${escapeLikePattern(requested)}%`, id],
        )
        changes.slug = ensureUniqueSlug(requested, existing.map(row => row.slug))
      }
    }

    const statement = buildUpdateStatement('law_firms', id, changes, LAW_FIRM_WRITABLE_COLUMNS)
    if (statement) {
      await executeWrite(statement.sql, statement.params)
      const changed = pickChangedFields(before, changes)
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'law_firm_update',
        entityType: 'law_firm',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: `更新律所字段：${Object.keys(changed.after).join(', ') || '无'}`,
        before: changed.before,
        after: changed.after,
      })
    }

    const rows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('law_firms'), [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'LAW_FIRM_NOT_FOUND', '律所不存在')
    return { data: { lawFirm: mapAdminEntityRow(row) } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'SLUG_CONFLICT', '律所标识已被占用，请更换 slug')
    console.error('[admin-law-firms] 更新律所失败', error)
    return fail(event, 500, 'LAW_FIRM_UPDATE_FAILED', '律所更新失败，请稍后重试')
  }
})
