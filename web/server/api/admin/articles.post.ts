// POST /api/admin/articles
//
// 新建文章。约定：
//   - 先校验 article:write 权限，再做任何查库；
//   - title 必填；status 只接受 draft|published|archived（默认 draft）；
//   - slug 缺省时由标题生成（算法同旧站迁移脚本），冲突时追加 -2、-3…… 保证唯一；
//   - categoryId 提供时必须真实存在；
//   - publishedAt 只接受 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss（也接受 T 分隔），null / 空串表示未发布；
//   - 正文 HTML 按原样入库：后台编辑的是真实历史内容，公开接口才做白名单清洗；
//   - 审计 action：article_create。
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { escapeLikePattern } from '../../utils/public/article-query'
import {
  ensureUniqueSlug,
  hasOwn,
  isBlankValue,
  parseContentStatus,
  parseArticleCoverMediaId,
  parseDateTimeInput,
  slugifyTitle,
  toBooleanFlag,
  toNullableId,
  toText,
} from '../../utils/admin/content-queries'
import {
  adminAuthError,
  executeWrite,
  fail,
  isDuplicateKeyError,
  readAdminBody,
  writeAuditSafely,
} from '../../utils/admin/http'

const MAX_TITLE_LENGTH = 255
const MAX_SLUG_LENGTH = 191

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'article:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少文章写入权限')
  }

  const body = await readAdminBody(event)
  const title = toText(body.title)
  if (!title) return fail(event, 400, 'INVALID_TITLE', '文章标题不能为空')
  if (title.length > MAX_TITLE_LENGTH) return fail(event, 400, 'INVALID_TITLE', '文章标题过长')

  const status = parseContentStatus(body.status)
  if (status === null) return fail(event, 400, 'INVALID_STATUS', '文章状态只能是 draft、published 或 archived')

  let categoryId: number | null = null
  if (hasOwn(body, 'categoryId') && !isBlankValue(body.categoryId)) {
    categoryId = toNullableId(body.categoryId)
    if (categoryId === null) return fail(event, 400, 'INVALID_CATEGORY', '文章分类参数不正确')
  }

  const parsedCoverMediaId = parseArticleCoverMediaId(body.coverMediaId)
  if (!parsedCoverMediaId.ok) return fail(event, 400, 'INVALID_COVER_MEDIA', '文章封面图片参数不正确')
  const coverMediaId = parsedCoverMediaId.value

  let publishedAt: string | null = null
  if (hasOwn(body, 'publishedAt')) {
    const parsed = parseDateTimeInput(body.publishedAt)
    if (!parsed.ok) {
      return fail(event, 400, 'INVALID_PUBLISHED_AT', '发布时间格式不正确，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss')
    }
    publishedAt = parsed.value
  }

  /**
   * 「发布即定时」：状态为 published 但没有任何发布时间时，用数据库当前时间补上。
   * 公开列表要求 published_at IS NOT NULL，否则会出现「已发布却查不到」的文章。
   */
  const autoPublishAt = status === 'published' && !publishedAt

  const requestedSlug = hasOwn(body, 'slug') ? toText(body.slug) : ''
  let slug = (requestedSlug ? slugifyTitle(requestedSlug) : slugifyTitle(title)).slice(0, MAX_SLUG_LENGTH)
  if (!slug) slug = slugifyTitle(title).slice(0, MAX_SLUG_LENGTH)

  const contentHtml = typeof body.contentHtml === 'string' ? body.contentHtml : ''
  const isFeatured = toBooleanFlag(body.isFeatured)
  // 侧边栏管理：勾选后该文章进入首页侧栏「推荐阅读」
  const showInSidebar = toBooleanFlag(body.showInSidebar)

  try {
    if (categoryId !== null) {
      const categories = await queryTarget<{ id: number }>(
        'SELECT id FROM article_categories WHERE id = ? AND status = 1 LIMIT 1',
        [categoryId],
      )
      if (!categories[0]) return fail(event, 400, 'INVALID_CATEGORY', '文章分类不存在或已停用')
    }
    if (coverMediaId !== null) {
      const media = await queryTarget<{ id: number }>(
        `SELECT id FROM media_assets
         WHERE id = ? AND usage_scope = 'article' AND deleted_at IS NULL LIMIT 1`,
        [coverMediaId],
      )
      if (!media[0]) return fail(event, 400, 'INVALID_COVER_MEDIA', '文章封面图片不存在或已停用')
    }

    // 只取同前缀的 slug 用于唯一化，避免把全表 slug 拉进内存。
    const existing = await queryTarget<{ slug: string }>(
      `SELECT slug FROM articles WHERE slug LIKE ? ESCAPE '!'`,
      [`${escapeLikePattern(slug)}%`],
    )
    slug = ensureUniqueSlug(slug, existing.map(row => row.slug))

    // published_at 要么走参数（?），要么走常量 NOW()：占位符数量由服务端决定，绝不来自请求体。
    const publishedAtExpression = autoPublishAt ? 'NOW()' : '?'
    const insertParams: unknown[] = [slug, title, contentHtml, categoryId]
    if (!autoPublishAt) insertParams.push(publishedAt)
    insertParams.push(coverMediaId, status, isFeatured, showInSidebar)

    const result = await executeWrite(
      `INSERT INTO articles
         (legacy_source_table, legacy_source_id, slug, title, content_html, category_id, published_at, cover_media_id, status, is_featured, show_in_sidebar, created_at, updated_at)
       VALUES ('manual', UUID_SHORT(), ?, ?, ?, ?, ${publishedAtExpression}, ?, ?, ?, ?, NOW(), NOW())`,
      insertParams,
    )

    if (categoryId !== null) {
      await executeWrite(
        'INSERT IGNORE INTO article_category_links (article_id, category_id) VALUES (?, ?)',
        [result.insertId, categoryId],
      )
    }

    const created = await queryTarget<{ slug: string }>('SELECT slug FROM articles WHERE id = ? LIMIT 1', [result.insertId])
    const createdSlug = created[0]?.slug ?? slug

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'article_create',
      entityType: 'article',
      entityId: result.insertId,
      ipDigest: getIpDigest(event),
      note: autoPublishAt ? '新建文章并补写当前发布时间' : '新建文章',
      after: { slug: createdSlug, title, status, categoryId, coverMediaId, publishedAt, isFeatured },
    })

    return { data: { id: result.insertId, slug: createdSlug } }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const duplicate = error as { sqlMessage?: string; message?: string }
      const message = `${duplicate.sqlMessage ?? ''} ${duplicate.message ?? ''}`
      const keyMatch = message.match(/for key ['`"]?([^'`"\s]+)['`"]?/i)
      const keyName = keyMatch?.[1]?.split('.').pop()?.replace(/['`"\\]/g, '')
      if (keyName === 'uk_articles_slug') {
        return fail(event, 409, 'SLUG_CONFLICT', '文章标识已被占用，请更换 slug')
      }
    }
    console.error('[admin-articles] 新建文章失败', error)
    return fail(event, 500, 'ARTICLE_CREATE_FAILED', '文章创建失败，请稍后重试')
  }
})
