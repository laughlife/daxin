// GET /api/admin/articles/[id]
//
// 后台文章详情。与公开接口 utils/public/article-sql.ts 的关键区别：
//   contentHtml 原样返回，**不做白名单清洗**。后台编辑器必须拿到库里真实的 HTML 才能继续编辑，
//   若在这里清洗，管理员一保存就会把清洗后的片段写回，等于永久改写历史正文。
//   只有公开接口（server/api/public/articles/[slug].get.ts）才在输出前 sanitizeHtml（纵深防御）。
// 权限：article:read。
import { requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import {
  ADMIN_ARTICLE_DETAIL_SQL,
  mapAdminArticleDetail,
  toRouteId,
  type AdminArticleRow,
} from '#server/utils/admin/content-queries'
import { adminAuthError, fail } from '#server/utils/admin/http'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'article:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少文章读取权限')
  }

  const id = toRouteId(getRouterParam(event, 'id'))
  if (id === null) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')

  try {
    const rows = await queryTarget<AdminArticleRow>(ADMIN_ARTICLE_DETAIL_SQL, [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')
    return { data: { article: mapAdminArticleDetail(row) } }
  } catch (error) {
    console.error('[admin-article-detail] 文章详情查询失败', error)
    return fail(event, 500, 'ARTICLE_QUERY_FAILED', '文章加载失败，请稍后重试')
  }
})
