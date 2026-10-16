// GET /api/admin/article-categories
// 文章编辑器使用的完整活动分类字典，不分页。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { mapAdminArticleCategoryRows, type AdminArticleCategoryRow } from '../../utils/admin/content-queries'
import { adminAuthError, fail } from '../../utils/admin/http'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'article:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少文章读取权限')
  }

  try {
    const rows = await queryTarget<AdminArticleCategoryRow>(`
SELECT id, slug, name, status
FROM article_categories
WHERE status = 1
ORDER BY sort_order ASC, id ASC`)
    return { data: mapAdminArticleCategoryRows(rows) }
  } catch (error) {
    console.error('[admin-article-categories] 分类字典查询失败', error)
    return fail(event, 500, 'ARTICLE_CATEGORIES_QUERY_FAILED', '文章分类加载失败，请稍后重试')
  }
})
