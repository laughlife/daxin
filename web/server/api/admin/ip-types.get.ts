// GET /api/admin/ip-types
//
// 侵权类型字典（后台下拉用）。之前没有任何接口能列出 ip_types，后台只能用「按 seed 顺序
// 假设 id 1..4」的硬编码映射，虽然当前库恰好吻合，但这是无法验证的假设：一旦自增顺序不同，
// 案件编辑器就会把商标标成专利。因此补上这个只读字典接口，让下拉直接读库。
//
// 只读、无需分页（当前仅 4 条，字典表不会长）；权限复用 case:read（案件编辑需要它）。
import { requireAdmin } from '../../utils/auth/context'
import { queryTarget } from '../../utils/db/query'
import { adminAuthError } from '../../utils/admin/http'

type IpTypeRow = {
  id: number | string
  slug: string | null
  name: string | null
  description: string | null
  sort_order: number | string | null
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'case:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少案件读取权限')
  }

  const rows = await queryTarget<IpTypeRow>(`
SELECT id, slug, name, description, sort_order
FROM ip_types
WHERE status = 1
ORDER BY sort_order ASC, id ASC`)

  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      slug: String(row.slug ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      sortOrder: Number(row.sort_order ?? 0),
    })),
  }
})
