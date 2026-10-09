import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { CaseQuery } from '~/repositories/cases'
import type { CaseType } from '~/types/content'

/**
 * TRO 案件查询状态（筛选条件 + 页码 + URL 同步）。
 *
 * 数据由 `~/repositories/cases` 的 fetchCases() 在服务端分页 / 筛选后返回，
 * 本组合式函数只负责维护查询条件、把条件映射成服务端查询参数，并同步到 URL query
 * （q/type/from/to/page），刷新后可恢复。取数本身由页面用 useAsyncData 完成，
 * 并以 queryKey 作为依赖，保证筛选或翻页都会重新请求。
 */
export interface CaseSearchFilters {
  /** 关键词：案件号 / 原告 / 品牌 / 律所（服务端按 OR 匹配这四个字段） */
  keyword: string
  /** 侵权类型筛选 */
  caseType: CaseType | ''
  /** 起诉时间起（YYYY-MM-DD） */
  dateFrom: string
  /** 起诉时间止（YYYY-MM-DD） */
  dateTo: string
}

export interface UseCaseSearchOptions {
  /** 每页条数，默认 8 */
  pageSize?: number
  /** 是否同步查询状态到 URL query，默认 true */
  syncQuery?: boolean
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

export function useCaseSearch(options: UseCaseSearchOptions = {}) {
  const { pageSize = 8, syncQuery = true } = options

  const route = useRoute()
  const router = useRouter()
  // 静态预渲染不含 URL query：首次水合保持同一 DOM，挂载后再应用查询条件。
  let ready = !(import.meta.client && useNuxtApp().payload.prerenderedAt)
  const initialQuery: typeof route.query = ready ? route.query : {}

  const filters = reactive<CaseSearchFilters>({
    keyword: queryToString(initialQuery.q),
    caseType: queryToCaseType(initialQuery.type),
    dateFrom: queryToString(initialQuery.from),
    dateTo: queryToString(initialQuery.to)
  })

  const page = ref(queryToPage(initialQuery.page))

  const hasActiveFilters = computed(() =>
    Boolean(filters.keyword.trim() || filters.caseType || filters.dateFrom || filters.dateTo)
  )

  /** 传给仓储的服务端查询条件；空值不下发，避免把空串塞进查询串。 */
  const apiQuery = computed<CaseQuery>(() => ({
    keyword: filters.keyword.trim() || undefined,
    caseType: filters.caseType || undefined,
    from: filters.dateFrom || undefined,
    to: filters.dateTo || undefined,
    page: page.value,
    pageSize
  }))

  /** useAsyncData 的 key：条件或页码变化即触发重新取数。 */
  const queryKey = computed(() => JSON.stringify(apiQuery.value))

  let readingQuery = false

  /** 筛选条件变化时回到第一页 */
  watch(filters, () => {
    if (!readingQuery) page.value = 1
  }, { flush: 'sync' })

  function setPage(value: number) {
    const parsed = Number(value)
    page.value = Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
  }

  function resetFilters() {
    filters.keyword = ''
    filters.caseType = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    page.value = 1
  }

  function buildQuery(): Record<string, string> {
    const query: Record<string, string> = {}
    if (filters.keyword.trim()) query.q = filters.keyword.trim()
    if (filters.caseType) query.type = filters.caseType
    if (filters.dateFrom) query.from = filters.dateFrom
    if (filters.dateTo) query.to = filters.dateTo
    if (page.value > 1) query.page = String(page.value)
    return query
  }

  function readQuery(query: typeof route.query) {
    readingQuery = true
    filters.keyword = queryToString(query.q)
    filters.caseType = queryToCaseType(query.type)
    filters.dateFrom = queryToString(query.from)
    filters.dateTo = queryToString(query.to)
    page.value = queryToPage(query.page)
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
    apiQuery,
    queryKey,
    hasActiveFilters,
    setPage,
    resetFilters
  }
}
