// PUT /api/admin/articles/[id]
//
// 更新文章。约定：
//   - 只接受白名单字段（title / slug / contentHtml / categoryId / publishedAt / status / isFeatured / showInSidebar），
//     请求体里的其它键（view_count、legacy_source_* 等）一律忽略；
//   - 只改请求里显式给出的字段，未提供的保持不变；显式传 null 表示清空（发布日期、分类）；
//   - 「不静默重算任何字段」：除了「发布时补当前发布时间」（见下）之外不做任何隐含推导；
//   - 状态改为 published 且始终没有发布时间时，用数据库 NOW() 补上，避免出现「已发布却查不到」的文章；
//   - 审计 action：article_update，before / after 只包含真正变化的字段。
import type { AdminUser } from '#server/utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '#server/utils/auth/context'
import { queryTarget } from '#server/utils/db/query'
import { escapeLikePattern } from '#server/utils/public/article-query'
import {
  ARTICLE_WRITABLE_COLUMNS,
  ADMIN_ARTICLE_DETAIL_SQL,
  buildUpdateStatement,
  ensureUniqueSlug,
  hasOwn,
  isBlankValue,
  mapAdminArticleDetail,
  parseDateTimeInput,
  pickChangedFields,
  readContentStatus,
  slugifyTitle,
  sqlNow,
  toBooleanFlag,
  toNullableId,
  toRouteId,
  toText,
  type AdminArticleRow,
} from '#server/utils/admin/content-queries'
import {
  adminAuthError,
  executeWrite,
  fail,
  isDuplicateKeyError,
  readAdminBody,
  writeAuditSafely,
} from '#server/utils/admin/http'

const MAX_TITLE_LENGTH = 255
const MAX_SLUG_LENGTH = 191

interface CurrentArticleRow {
  slug: string | null
  title: string | null
  content_html: string | null
  category_id: number | string | null
  published_at: string | null
  status: string | null
  is_featured: number | string | null
  show_in_sidebar: number | string | null
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

  const body = await readAdminBody(event)

  try {
    const currentRows = await queryTarget<CurrentArticleRow>(
      `SELECT slug, title, COALESCE(content_html, '') AS content_html,
         category_id,
         DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS published_at,
         status, is_featured, show_in_sidebar
       FROM articles WHERE id = ? LIMIT 1`,
      [id],
    )
    const current = currentRows[0]
    if (!current) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')

    // changes 的键就是数据库列名，值来自下面的显式解析；绝不把请求体的键塞进来。
    const changes: Record<string, unknown> = {}

    if (hasOwn(body, 'title')) {
      const title = toText(body.title)
      if (!title) return fail(event, 400, 'INVALID_TITLE', '文章标题不能为空')
      if (title.length > MAX_TITLE_LENGTH) return fail(event, 400, 'INVALID_TITLE', '文章标题过长')
      changes.title = title
    }

    if (hasOwn(body, 'status')) {
      const status = readContentStatus(body.status)
      if (!status) return fail(event, 400, 'INVALID_STATUS', '文章状态只能是 draft、published 或 archived')
      changes.status = status
    }

    if (hasOwn(body, 'contentHtml')) {
      changes.content_html = typeof body.contentHtml === 'string' ? body.contentHtml : ''
    }
    if (hasOwn(body, 'isFeatured')) changes.is_featured = toBooleanFlag(body.isFeatured) ? 1 : 0
    // 侧边栏管理：是否进入首页侧栏「推荐阅读」
    if (hasOwn(body, 'showInSidebar')) changes.show_in_sidebar = toBooleanFlag(body.showInSidebar) ? 1 : 0

    if (hasOwn(body, 'categoryId')) {
      let categoryId: number | null = null
      if (!isBlankValue(body.categoryId)) {
        categoryId = toNullableId(body.categoryId)
        if (categoryId === null) return fail(event, 400, 'INVALID_CATEGORY', '文章分类参数不正确')
      }
      changes.category_id = categoryId
    }

    if (hasOwn(body, 'publishedAt')) {
      const parsed = parseDateTimeInput(body.publishedAt)
      if (!parsed.ok) {
        return fail(event, 400, 'INVALID_PUBLISHED_AT', '发布时间格式不正确，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss')
      }
      changes.published_at = parsed.value
    }

    if (hasOwn(body, 'slug')) {
      const requested = slugifyTitle(toText(body.slug)).slice(0, MAX_SLUG_LENGTH)
      if (!requested) return fail(event, 400, 'INVALID_SLUG', '文章标识不能为空')
      if (requested !== current.slug) {
        const existing = await queryTarget<{ slug: string }>(
          `SELECT slug FROM articles WHERE slug LIKE ? ESCAPE '!' AND id <> ?`,
          [`${escapeLikePattern(requested)}%`, id],
        )
        changes.slug = ensureUniqueSlug(requested, existing.map(row => row.slug))
      }
    }

    // 「发布即定时」：改为 published 且当前与本次都没有发布时间时补 NOW()。
    const nextStatus = changes.status ?? current.status
    const nextPublishedAt = hasOwn(changes, 'published_at') ? changes.published_at : current.published_at
    if (nextStatus === 'published' && !nextPublishedAt) changes.published_at = sqlNow()

    if (changes.category_id !== undefined && changes.category_id !== null) {
      const categories = await queryTarget<{ id: number }>(
        'SELECT id FROM article_categories WHERE id = ? LIMIT 1',
        [changes.category_id],
      )
      if (!categories[0]) return fail(event, 400, 'INVALID_CATEGORY', '文章分类不存在')
    }

    const before: Record<string, unknown> = {
      slug: current.slug,
      title: current.title,
      content_html: current.content_html,
      category_id: current.category_id === null ? null : Number(current.category_id),
      published_at: current.published_at,
      status: current.status,
      is_featured: current.is_featured,
      show_in_sidebar: current.show_in_sidebar,
    }

    const statement = buildUpdateStatement('articles', id, changes, ARTICLE_WRITABLE_COLUMNS)
    if (statement) {
      await executeWrite(statement.sql, statement.params)
      const changed = pickChangedFields(before, changes)
      await writeAuditSafely({
        userId: admin.id,
        username: admin.username,
        action: 'article_update',
        entityType: 'article',
        entityId: id,
        ipDigest: getIpDigest(event),
        note: `更新文章字段：${Object.keys(changed.after).join(', ') || '无'}`,
        before: changed.before,
        after: changed.after,
      })
    }

    const rows = await queryTarget<AdminArticleRow>(ADMIN_ARTICLE_DETAIL_SQL, [id])
    const row = rows[0]
    if (!row) return fail(event, 404, 'ARTICLE_NOT_FOUND', '文章不存在')
    return { data: { article: mapAdminArticleDetail(row) } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'SLUG_CONFLICT', '文章标识已被占用，请更换 slug')
    console.error('[admin-articles] 更新文章失败', error)
    return fail(event, 500, 'ARTICLE_UPDATE_FAILED', '文章更新失败，请稍后重试')
  }
})
