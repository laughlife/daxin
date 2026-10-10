// DELETE /api/admin/articles/[id]
//
// 软归档：只把 status 置为 'archived'，**绝不物理删除**。
// 原因：迁移来源（legacy_source_table / legacy_source_id）、正文配图关联（article_images）
// 都必须保留，物理删除会切断旧站溯源与图片归档；需要彻底下架时另行人工处理。
// 幂等：已经是 archived 的文章不重复写审计。
// 权限：article:write；审计 action：article_archive。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { toRouteId } from '#server/utils/admin/content-queries'
import { adminAuthError, executeWrite, fail, writeAuditSafely } from '#server/utils/admin/http'

interface ArticleStatusRow {
  status: string | null
}

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'article:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少文章写入权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')

  try {
    const rows = await queryTarget<ArticleStatusRow>('SELECT status FROM articles WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')

    if (row.status !== 'archived') {
      await executeWrite('UPDATE articles SET status = ?, updated_at = NOW() WHERE id = ?', ['archived', id])
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'article_archive',
        entityType: 'article',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: '归档文章（软删除，保留迁移来源与图片关联）',
        before: { status: row.status },
        after: { status: 'archived' },
      })
    }

    return { data: { id, status: 'archived' } }
  } catch (error) {
    console.error('[admin-articles] 归档文章失败', error)
    return fail(event, 500, 'ARTICLE_ARCHIVE_FAILED', '文章归档失败，请稍后重试')
  }
})
