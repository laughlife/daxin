// POST /api/admin/brands
//
// 新建品牌。可写字段即白名单：slug、name、nameEn、aliases、summary、status。
//   - name 必填；slug 缺省时由名称生成（算法同旧站迁移脚本），冲突时追加 -2、-3…… 保证唯一；
//   - caseCount 只读：由 case_brands 统计得出，本接口不读也不写请求体里的 caseCount（会被直接忽略）；
//   - region 不属于品牌，即使请求里带了也会被忽略；
//   - status 是 TINYINT(1)：1 正常、0 归档。
//   - 审计 action：brand_create。
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { escapeLikePattern } from '../../utils/public/article-query'
import {
  ensureUniqueSlug,
  hasOwn,
  parseMediaAssetId,
  parseEntityStatus,
  slugifyTitle,
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

const MAX_SLUG_LENGTH = 191

export default defineEventHandler(async (event) => {
  let admin: AdminUser
  try {
    admin = await requireAdmin(event, 'brand:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少品牌写入权限')
  }

  const body = await readAdminBody(event)
  const name = toText(body.name)
  if (!name) return fail(event, 400, 'INVALID_NAME', '品牌名称不能为空')

  const status = parseEntityStatus(body.status)
  if (status === null) return fail(event, 400, 'INVALID_STATUS', '品牌状态只能是 1（正常）或 0（归档）')

  const requestedSlug = hasOwn(body, 'slug') ? toText(body.slug) : ''
  let slug = (requestedSlug ? slugifyTitle(requestedSlug) : slugifyTitle(name)).slice(0, MAX_SLUG_LENGTH)
  if (!slug) return fail(event, 400, 'INVALID_SLUG', '品牌标识不能为空')

  const nameEn = toText(body.nameEn)
  const aliases = toText(body.aliases)
  const summary = toText(body.summary)
  const parsedLogoMediaId = parseMediaAssetId(body.logoMediaId)
  if (!parsedLogoMediaId.ok) return fail(event, 400, 'INVALID_BRAND_LOGO', '品牌图片参数不正确')
  const logoMediaId = parsedLogoMediaId.value

  try {
    if (logoMediaId !== null) {
      const media = await queryTarget<{ id: number }>(
        `SELECT id FROM media_assets WHERE id = ? AND usage_scope = 'logo' AND deleted_at IS NULL LIMIT 1`,
        [logoMediaId],
      )
      if (!media[0]) return fail(event, 400, 'INVALID_BRAND_LOGO', '品牌图片不存在或已停用')
    }

    const existing = await queryTarget<{ slug: string }>(
      `SELECT slug FROM brands WHERE slug LIKE ? ESCAPE '!'`,
      [`${escapeLikePattern(slug)}%`],
    )
    slug = ensureUniqueSlug(slug, existing.map(row => row.slug))

    const result = await executeWrite(
      `INSERT INTO brands (slug, name, name_en, aliases, logo_media_id, summary, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [slug, name, nameEn, aliases, logoMediaId, summary, status],
    )

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'brand_create',
      entityType: 'brand',
      entityId: result.insertId,
      ipDigest: getIpDigest(event),
      note: '新建品牌',
      after: { slug, name, nameEn, aliases, logoMediaId, summary, status },
    })

    return { data: { id: result.insertId, slug } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'SLUG_CONFLICT', '品牌标识已被占用，请更换 slug')
    console.error('[admin-brands] 新建品牌失败', error)
    return fail(event, 500, 'BRAND_CREATE_FAILED', '品牌创建失败，请稍后重试')
  }
})
