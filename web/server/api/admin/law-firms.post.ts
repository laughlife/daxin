// POST /api/admin/law-firms
//
// 新建律所。可写字段即白名单：slug、name、nameEn、aliases、region、summary、status。
//   - name 必填；slug 缺省时由名称生成（算法同旧站迁移脚本），冲突时追加 -2、-3…… 保证唯一；
//   - caseCount 只读：由 case_law_firms 统计得出，请求体里的 caseCount 会被直接忽略；
//   - status 是 TINYINT(1)：1 正常、0 归档。
//   - 审计 action：law_firm_create。
import type { AdminUser } from '../../utils/auth/admin-user'
import { getIpDigest, requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { escapeLikePattern } from '../../utils/public/article-query'
import {
  ensureUniqueSlug,
  hasOwn,
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
    admin = await requireAdmin(event, 'law_firm:write')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少律所写入权限')
  }

  const body = await readAdminBody(event)
  const name = toText(body.name)
  if (!name) return fail(event, 400, 'INVALID_NAME', '律所名称不能为空')

  const status = parseEntityStatus(body.status)
  if (status === null) return fail(event, 400, 'INVALID_STATUS', '律所状态只能是 1（正常）或 0（归档）')

  const requestedSlug = hasOwn(body, 'slug') ? toText(body.slug) : ''
  let slug = (requestedSlug ? slugifyTitle(requestedSlug) : slugifyTitle(name)).slice(0, MAX_SLUG_LENGTH)
  if (!slug) return fail(event, 400, 'INVALID_SLUG', '律所标识不能为空')

  const nameEn = toText(body.nameEn)
  const aliases = toText(body.aliases)
  const region = toText(body.region)
  const summary = toText(body.summary)

  try {
    const existing = await queryTarget<{ slug: string }>(
      `SELECT slug FROM law_firms WHERE slug LIKE ? ESCAPE '!'`,
      [`${escapeLikePattern(slug)}%`],
    )
    slug = ensureUniqueSlug(slug, existing.map(row => row.slug))

    const result = await executeWrite(
      `INSERT INTO law_firms (slug, name, name_en, aliases, region, summary, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [slug, name, nameEn, aliases, region, summary, status],
    )

    await writeAuditSafely({
      userId: admin.id,
      username: admin.username,
      action: 'law_firm_create',
      entityType: 'law_firm',
      entityId: result.insertId,
      ipDigest: getIpDigest(event),
      note: '新建律所',
      after: { slug, name, nameEn, aliases, region, summary, status },
    })

    return { data: { id: result.insertId, slug } }
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail(event, 409, 'SLUG_CONFLICT', '律所标识已被占用，请更换 slug')
    console.error('[admin-law-firms] 新建律所失败', error)
    return fail(event, 500, 'LAW_FIRM_CREATE_FAILED', '律所创建失败，请稍后重试')
  }
})
