import { requireAdmin } from '../../utils/auth/context'
import { adminAuthError, fail } from '../../utils/admin/http'
import { ADMIN_MAX_PAGE_SIZE, adminPageSize } from '../../utils/admin/content-queries'
import { queryTarget } from '../../utils/db/query'
import { resolvePageWindow } from '../../utils/public/query'

interface CountRow {
  total: number | string | null
}

interface InfringementCheckRow {
  id: number | string
  brand_name: string | null
  product_name: string | null
  contact_name: string | null
  contact_method: string | null
  remark: string | null
  created_at: string | null
}

const SELECT_COLUMNS = `id, brand_name, product_name, contact_name, contact_method, remark,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at`

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event, 'product_infringement_check:read')
  } catch (error) {
    return adminAuthError(event, error, '当前账号缺少产品侵权检测记录读取权限')
  }

  const query = getQuery(event) as Record<string, unknown>

  try {
    const countRows = await queryTarget<CountRow>(
      'SELECT COUNT(*) AS total FROM product_infringement_checks',
    )
    const total = Number(countRows[0]?.total ?? 0)
    const window = resolvePageWindow(total, query.page, adminPageSize(query.pageSize), ADMIN_MAX_PAGE_SIZE)
    const meta = {
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    }

    if (window.total === 0 || window.beyondLastPage) return { data: [], meta }

    const rows = await queryTarget<InfringementCheckRow>(
      `SELECT ${SELECT_COLUMNS}
FROM product_infringement_checks
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?`,
      [window.pageSize, window.offset],
    )

    return {
      data: rows.map((row) => ({
        id: Number(row.id),
        brand: String(row.brand_name ?? ''),
        product: String(row.product_name ?? ''),
        contactName: String(row.contact_name ?? ''),
        contactWay: String(row.contact_method ?? ''),
        remark: row.remark ? String(row.remark) : '',
        createdAt: String(row.created_at ?? ''),
      })),
      meta,
    }
  } catch {
    console.error('[admin-infringement-checks] 记录列表查询失败')
    return fail(event, 500, 'INFRINGEMENT_CHECKS_QUERY_FAILED', '产品侵权检测记录加载失败，请稍后重试')
  }
})
