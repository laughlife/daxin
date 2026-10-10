// PUT /api/admin/brands/[id]
//
// 更新品牌。只接受白名单字段（slug、name、nameEn、aliases、summary、status），
// 请求体里的 caseCount 是只读派生值，即使传了也**直接忽略**（不写入、不影响返回的统计值）；
// region 不属于品牌，同样忽略。只改显式给出的字段保持不变。
// 审计 action：brand_update，before / after 只包含真正变化的字段。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { escapeLikePattern } from '#server/utils/public/article-query'
import {
  BRAND_WRITABLE_COLUMNS,
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
    admin = await requireAdmin(event, 'brand:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少品牌写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')

  const body = await readAdminBody(event)

  try {
    const currentRows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('brands'), [id])
    const currentRow = currentRows[0]
    if (!currentRow) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')
    const current = mapAdminEntityRow(currentRow)

    const changes: Record<string, unknown> = {}
    const before: Record<string, unknown> = {
      slug: current.slug,
      name: current.name,
      name_en: current.nameEn,
      aliases: current.aliases,
      summary: current.summary,
      status: current.status,
    }

    if (hasOwn(body, 'name')) {
      const name = toText(body.name)
      if (!name) return fail(event, 400, 'INVALID_NAME', '品牌名称不能为空')
      changes.name = name
    }
    if (hasOwn(body, 'nameEn')) changes.name_en = toText(body.nameEn)
    if (hasOwn(body, 'aliases')) changes.aliases = toText(body.aliases)
    if (hasOwn(body, 'summary')) changes.summary = toText(body.summary)

    if (hasOwn(body, 'status')) {
      const status = parseEntityStatus(body.status, 1)
      if (status === null) return fail(event, 400, 'INVALID_STATUS', '品牌状态只能是 1（正常）或 0（归档）')
      changes.status = status
    }

    if (hasOwn(body, 'slug')) {
      const requested = slugifyTitle(toText(body.slug)).slice(0, MAX_SLUG_LENGTH)
      if (!requested) return fail(event, 400, 'INVALID_SLUG', '品牌标识不能为空')
      if (requested !== current.slug) {
        const existing = await queryTarget<{ slug: string }>(
          `SELECT slug FROM brands WHERE slug LIKE ? ESCAPE '!' AND id <> ?`,
          [`${escapeLikePattern(requested)}%`, id],
        )
        changes.slug = ensureUniqueSlug(requested, existing.map(row => row.slug))
      }
    }

    const statement = buildUpdateStatement('brands', id, changes, BRAND_WRITABLE_COLUMNS)
    if (statement) {
      await executeWrite(statement.sql, statement.params)
      const changed = pickChangedFields(before, changes)
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'brand_update',
        entityType: 'brand',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: `更新品牌字段：${Object.keys(changed.after).join(', ') || '无'}`,
        before: changed.before,
        after: changed.after,
      })
    }

    const rows = await queryTarget<AdminEntityRow>(adminEntityDetailSql('brands'), [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'BRAND_NOT_FOUND', '品牌不存在')
    return { data: { brand: mapAdminEntityRow(row) } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'SLUG_CONFLICT', '品牌标识已被占用，请更换 slug')
    console.error('[admin-brands] 更新品牌失败', error)
    return fail(event, 500, 'BRAND_UPDATE_FAILED', '品牌更新失败，请稍后重试')
  }
})
