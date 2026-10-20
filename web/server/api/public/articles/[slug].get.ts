// GET /api/public/articles/{slug}
//
// 公开文章详情。正文 HTML 在返回前再清洗一次（纵深防御）：
// 库里的 content_html 来自旧站迁移，绝不直接信任历史标记。
import { queryTarget } from '../../../utils/db/query'
import { ARTICLE_DETAIL_SQL } from '../../../utils/public/article-sql'
import { toArticleSummary, type ArticleRow } from '../../../utils/public/article-query'
import { sanitizeHtml } from '../../../utils/public/sanitize'
import type { H3Event } from 'h3'

/** articles.slug 列宽 191，超长输入直接按未命中处理，不查库。 */
const MAX_SLUG_LENGTH = 191

interface ArticleDetailRow extends ArticleRow {
  content_html?: string | null
}

function notFound(event: H3Event): { error: { code: string; message: string } } {
  setResponseStatus(event, 404)
  return { error: { code: 'ARTICLE_NOT_FOUND', message: '文章不存在或未发布' } }
}

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '').trim()
  if (!slug || slug.length > MAX_SLUG_LENGTH) return notFound(event)

  try {
    const rows = await queryTarget<ArticleDetailRow>(ARTICLE_DETAIL_SQL, [slug])
    const row = rows[0]
    if (!row) return notFound(event)

    const article = toArticleSummary(row)
    if (article.href.startsWith('https://mp.weixin.qq.com/')) {
      return sendRedirect(event, article.href, 302)
    }

    return {
      data: {
        article,
        html: sanitizeHtml(row.content_html),
      },
    }
  } catch (error) {
    console.error('[public-article-detail] 文章详情查询失败', error)
    setResponseStatus(event, 500)
    return { error: { code: 'ARTICLE_QUERY_FAILED', message: '文章加载失败，请稍后重试' } }
  }
})
