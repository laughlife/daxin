import { computed, reactive, ref, watch } from 'vue'
import { mockCases } from '~/data/mock/cases'
import type { CaseRecord, CaseType } from '~/types/content'
import { clampPage, inDateRange } from '~/utils/content'

/**
 * TRO 案件本地 Mock 搜索（不调用 fetch、不伪造后端接口）。
 *
 * - 搜索字段：案件号 / 原告品牌 / 代理律所（均不区分大小写的包含匹配）；
 * - 筛选：案件类型（商标/专利/版权）、起诉州；
 * - 本地分页，分页逻辑与筛选解耦、可复用；
 * - 查询状态映射到 URL query（cn/brand/firm/type/state/page），刷新后可恢复；
 * - 数据源默认 mockCases，可通过 options.source 注入（未来切换 API 数据仓库）。
 */

export interface CaseSearchFilters {
  caseNumber: string
  plaintiffBrand: string
  lawFirm: string
  caseType: CaseType | ''
  state: string
  dateFrom: string
  dateTo: string
}

export interface UseMockCaseSearchOptions {
  /** 每页条数，默认 8 */
  pageSize?: number
  /** 是否同步查询状态到 URL query，默认 true */
  syncQuery?: boolean
  /** 数据源，默认本地 Mock 案件列表 */
  source?: CaseRecord[]
}

const CASE_TYPES: CaseType[] = ['trademark', 'patent', 'copyright']

function queryToString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0]! : ''
  return typeof value === 'string' ? value : ''
}

function queryToCaseType(value: unknown): CaseType | '' {
  const raw = queryToString(value)
  return (CASE_TYPES as string[]).includes(raw) ? (raw as CaseType) : ''
}

function queryToPage(value: unknown): number {
  const parsed = Number(queryToString(value))
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase())
}

export function useMockCaseSearch(options: UseMockCaseSearchOptions = {}) {
  const { pageSize = 8, syncQuery = true, source = mockCases } = options

  const route = useRoute()
  const router = useRouter()
  // 静态预渲染不含 URL query：首次水合保持同一 DOM，挂载后再应用查询条件。
  let ready = !(import.meta.client && useNuxtApp().payload.prerenderedAt)
  const initialQuery: typeof route.query = ready ? route.query : {}

  const filters = reactive<CaseSearchFilters>({
    caseNumber: queryToString(initialQuery.cn),
    plaintiffBrand: queryToString(initialQuery.brand),
    lawFirm: queryToString(initialQuery.firm),
    caseType: queryToCaseType(initialQuery.type),
    state: queryToString(initialQuery.state),
    dateFrom: queryToString(initialQuery.from),
    dateTo: queryToString(initialQuery.to)
  })

  const page = ref(queryToPage(initialQuery.page))

  /** 筛选结果（不含分页） */
  const results = computed<CaseRecord[]>(() =>
    source.filter(record => {
      if (filters.caseNumber.trim() && !contains(record.caseNumber, filters.caseNumber)) {
        return false
      }
      if (
        filters.plaintiffBrand.trim() &&
        !contains(record.plaintiffBrand, filters.plaintiffBrand)
      ) {
        return false
      }
      if (filters.lawFirm.trim() && !contains(record.lawFirm, filters.lawFirm)) {
        return false
      }
      if (filters.caseType && record.caseType !== filters.caseType) {
        return false
      }
      if (filters.state && record.state !== filters.state) {
        return false
      }
      return inDateRange(record.filedAt, filters.dateFrom, filters.dateTo)
    })
  )

  const total = computed(() => results.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

  /** 当前页数据 */
  const pagedResults = computed<CaseRecord[]>(() => {
    const start = (page.value - 1) * pageSize
    return results.value.slice(start, start + pageSize)
  })

  const hasActiveFilters = computed(() =>
    Boolean(
      filters.caseNumber.trim() ||
        filters.plaintiffBrand.trim() ||
        filters.lawFirm.trim() ||
        filters.caseType ||
        filters.state || filters.dateFrom || filters.dateTo
    )
  )

  const hasResults = computed(() => total.value > 0)

  let readingQuery = false

  /** 筛选条件变化时回到第一页 */
  watch(filters, () => {
    if (!readingQuery) page.value = 1
  }, { flush: 'sync' })

  /** 结果页数变少时收敛当前页 */
  watch(totalPages, value => {
    page.value = clampPage(page.value, value)
  }, { immediate: true, flush: 'sync' })

  function setPage(value: number) {
    page.value = clampPage(value, totalPages.value)
  }

  function resetFilters() {
    filters.caseNumber = ''
    filters.plaintiffBrand = ''
    filters.lawFirm = ''
    filters.caseType = ''
    filters.state = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    page.value = 1
  }

  /** 将某个字段设置为指定值（供表格内“按此律所筛选”等入口复用） */
  function applyFilter<K extends keyof CaseSearchFilters>(key: K, value: CaseSearchFilters[K]) {
    filters[key] = value
  }

  function buildQuery(): Record<string, string> {
    const query: Record<string, string> = {}
    if (filters.caseNumber.trim()) query.cn = filters.caseNumber.trim()
    if (filters.plaintiffBrand.trim()) query.brand = filters.plaintiffBrand.trim()
    if (filters.lawFirm.trim()) query.firm = filters.lawFirm.trim()
    if (filters.caseType) query.type = filters.caseType
    if (filters.state) query.state = filters.state
    if (filters.dateFrom) query.from = filters.dateFrom
    if (filters.dateTo) query.to = filters.dateTo
    if (page.value > 1) query.page = String(page.value)
    return query
  }

  function readQuery(query: typeof route.query) {
    readingQuery = true
    filters.caseNumber = queryToString(query.cn)
    filters.plaintiffBrand = queryToString(query.brand)
    filters.lawFirm = queryToString(query.firm)
    filters.caseType = queryToCaseType(query.type)
    filters.state = queryToString(query.state)
    filters.dateFrom = queryToString(query.from)
    filters.dateTo = queryToString(query.to)
    page.value = clampPage(queryToPage(query.page), totalPages.value)
    readingQuery = false
  }
  watch(() => route.query, query => { if (ready) readQuery(query) }, { flush: 'sync' })

  function syncUrl() {
    if (!syncQuery || !import.meta.client || !ready) return
    const query = buildQuery()
    if (Object.keys(query).length !== Object.keys(route.query).length || Object.entries(query).some(([key, value]) => route.query[key] !== value)) {
      void router.replace({ query })
    }
  }
  if (syncQuery) watch([filters, page], syncUrl, { flush: 'post', immediate: true })
  onMounted(() => {
    ready = true
    readQuery(route.query)
    syncUrl()
  })

  return {
    filters,
    page,
    pageSize,
    results,
    pagedResults,
    total,
    totalPages,
    hasActiveFilters,
    hasResults,
    setPage,
    resetFilters,
    applyFilter
  }
}
