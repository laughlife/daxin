// POST /api/admin/cases/bulk-publish
// 发布后台当前页选中的草稿案件；最多 50 条，已发布和已归档记录保持原样。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { adminAuthError, executeWrite, fail, readAdminBody, writeAuditSafely } from '#server/utils/admin/http'

interface CaseRow {
  id: number | string
  case_number: string | null
  publish_status: string | null
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'case:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案例写入权限')
  }

  const body = await readAdminBody(event)
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 50) {
    return fail(event, 400, 'INVALID_CASE_IDS', '请选择 1 至 50 条案件')
  }

  const ids = [...new Set(body.ids.map((value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return 0
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return 0
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : 0
  }))]
  if (ids.length !== body.ids.length || ids.includes(0)) {
    return fail(event, 400, 'INVALID_CASE_IDS', '案件编号不正确')
  }

  try {
    const placeholders = ids.map(() => '?').join(', ')
    const rows = await queryTarget<CaseRow>(
      `SELECT id, case_number, publish_status FROM cases WHERE id IN (${placeholders})`,
      ids,
    )
    const drafts = rows.filter(row => row.publish_status === 'draft')
    const draftIds = drafts.map(row => Number(row.id))

    if (draftIds.length > 0) {
      const draftPlaceholders = draftIds.map(() => '?').join(', ')
      await executeWrite(
        `UPDATE cases SET publish_status = 'published', updated_at = NOW()
         WHERE publish_status = 'draft' AND id IN (${draftPlaceholders})`,
        draftIds,
      )
      await Promise.all(drafts.map(row => writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'case_publish',
        entityType: 'case',
        entityId: Number(row.id),
        ipDigest: getIpDigest(event),
        note: '从案件列表批量发布',
        before: { publish_status: 'draft' },
        after: { publish_status: 'published' },
      })))
    }

    return {
      data: {
        publishedCount: draftIds.length,
        unchangedCount: ids.length - draftIds.length,
      },
    }
  } catch (error) {
    console.error('[admin-cases] 批量发布失败', error)
    return fail(event, 500, 'CASES_BULK_PUBLISH_FAILED', '批量发布失败，请稍后重试')
  }
})
