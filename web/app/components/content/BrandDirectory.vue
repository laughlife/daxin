<script setup lang="ts">
import { fetchBrandDirectory } from '~/repositories/entities'
import type { BrandDirectoryPage, BrandDirectoryStats } from '~/repositories/entities'
import type { CaseType } from '~/types/content'
import { CASE_TYPE_LABELS } from '~/utils/caseTypeLabel'

const route = useRoute()
const router = useRouter()
const typeOptions: Array<{ value: CaseType | ''; label: string; stat: keyof BrandDirectoryStats }> = [
  { value: '', label: '全部', stat: 'total' },
  { value: 'trademark', label: '商标', stat: 'trademark' },
  { value: 'patent', label: '专利', stat: 'patent' },
  { value: 'copyright', label: '版权', stat: 'copyright' },
]
const pageSizeOptions = [10, 20, 30, 40, 50]

function queryText(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function queryPage(value: unknown): number {
  const parsed = Number(queryText(value))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function queryType(value: unknown): CaseType | '' {
  const candidate = queryText(value)
  return candidate === 'trademark' || candidate === 'patent' || candidate === 'copyright' ? candidate : ''
}

const keyword = ref(queryText(route.query.q))
const appliedKeyword = ref(keyword.value)
const caseType = ref(queryType(route.query.type))
const page = ref(queryPage(route.query.page))
const pageSize = ref(pageSizeOptions.includes(Number(queryText(route.query.size))) ? Number(queryText(route.query.size)) : 20)

function emptyResult(): BrandDirectoryPage {
  return {
    items: [], total: 0, page: 1, pageSize: pageSize.value, totalPages: 1,
    stats: { total: 0, trademark: 0, patent: 0, copyright: 0 },
  }
}

const { data, error, status, refresh } = await useAsyncData(
  () => `brand-directory:${appliedKeyword.value}:${caseType.value}:${page.value}:${pageSize.value}`,
  () => fetchBrandDirectory({
    keyword: appliedKeyword.value,
    caseType: caseType.value || undefined,
    page: page.value,
    pageSize: pageSize.value,
  }),
  { default: emptyResult },
)

const result = computed(() => data.value ?? emptyResult())
const isLoading = computed(() => status.value === 'pending')
const visiblePages = computed(() => {
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  let start = Math.max(1, result.value.page - half)
  const end = Math.min(result.value.totalPages, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
const errorMessage = computed(() => error.value instanceof Error && error.value.message
  ? error.value.message
  : '品牌列表加载失败，请稍后重试')

function submitSearch() {
  appliedKeyword.value = keyword.value.trim()
  page.value = 1
}

function selectType(type: CaseType | '') {
  caseType.value = type
  page.value = 1
}

function buildQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (appliedKeyword.value) query.q = appliedKeyword.value
  if (caseType.value) query.type = caseType.value
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.size = String(pageSize.value)
  return query
}

watch([appliedKeyword, caseType, page, pageSize], async () => {
  if (!import.meta.client) return
  const query = buildQuery()
  if (Object.keys(query).length !== Object.keys(route.query).length || Object.entries(query).some(([key, value]) => route.query[key] !== value)) {
    await router.replace({ query })
  }
}, { flush: 'post' })

watch(() => route.query, (query) => {
  const nextKeyword = queryText(query.q)
  const nextType = queryType(query.type)
  const nextPage = queryPage(query.page)
  const rawSize = Number(queryText(query.size))
  const nextSize = pageSizeOptions.includes(rawSize) ? rawSize : 20
  if (nextKeyword !== appliedKeyword.value) {
    appliedKeyword.value = nextKeyword
    keyword.value = nextKeyword
  }
  caseType.value = nextType
  page.value = nextPage
  pageSize.value = nextSize
}, { flush: 'sync' })

watch([caseType, pageSize], () => { page.value = 1 }, { flush: 'sync' })
watch(data, value => {
  if (value && page.value > value.totalPages) page.value = value.page
})

useSeoMeta({
  title: '侵权品牌库 · 大信法务',
  description: '按商标、专利、版权查看侵权品牌，并通过案件号、品牌名或代理律所检索公开案件资料。',
})
</script>

<template>
  <div class="brand-directory">
    <PageContainer>
      <SectionHeading :level="1" title="侵权品牌库" />
      <ContentColumns group="tro">
        <section class="brand-directory__panel" aria-label="品牌搜索与分类">
          <form class="brand-directory__search" role="search" @submit.prevent="submitSearch">
            <label class="brand-directory__search-label" for="brand-directory-keyword">关键词</label>
            <div class="brand-directory__search-control">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
              <input
                id="brand-directory-keyword"
                v-model="keyword"
                type="search"
                placeholder="输入案件号、品牌名或律所名"
                autocomplete="off"
              >
              <button type="submit">搜索</button>
            </div>
          </form>

          <nav class="brand-directory__tabs" aria-label="侵权类型筛选">
            <button
              v-for="option in typeOptions"
              :key="option.value || 'all'"
              type="button"
              :class="{ 'is-active': caseType === option.value }"
              :aria-pressed="caseType === option.value"
              @click="selectType(option.value)"
            >
              <span>{{ option.label }}</span>
              <small>{{ result.stats[option.stat] }}</small>
            </button>
          </nav>
        </section>

        <ErrorState
          v-if="error"
          title="品牌列表加载失败"
          :message="errorMessage"
          @retry="refresh"
        />

        <template v-else>
          <div class="brand-directory__result-head">
            <p>共 <strong>{{ result.total }}</strong> 个品牌</p>
            <label>
              每页
              <select v-model.number="pageSize" aria-label="每页显示数量">
                <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
              </select>
              条
            </label>
          </div>

          <p v-if="isLoading" class="brand-directory__state" role="status">正在加载品牌…</p>
          <div v-else-if="result.items.length" class="brand-directory__grid">
            <article v-for="item in result.items" :key="item.slug" class="brand-card">
              <div class="brand-card__topline">
                <div class="brand-card__mark" aria-hidden="true">{{ item.name.slice(0, 1) }}</div>
                <div class="brand-card__types">
                  <span v-for="type in item.caseTypes ?? []" :key="type">{{ CASE_TYPE_LABELS[type] }}</span>
                  <span v-if="!item.caseTypes?.length" class="brand-card__type-muted">侵权类型待确认</span>
                </div>
              </div>
              <h2><NuxtLink :to="`/brands/${item.slug}`">{{ item.name }}</NuxtLink></h2>
              <p v-if="item.description" class="brand-card__description">{{ item.description }}</p>
              <div class="brand-card__footer">
                <span>关联案件</span>
                <strong>{{ item.caseCount }}</strong>
                <NuxtLink :to="`/brands/${item.slug}`" :aria-label="`查看${item.name}品牌档案`">查看档案 <span aria-hidden="true">→</span></NuxtLink>
              </div>
            </article>
          </div>
          <p v-else class="brand-directory__empty" role="status">没有找到符合条件的品牌，请更换关键词或分类。</p>

          <nav v-if="result.totalPages > 1" class="brand-directory__pagination" aria-label="品牌库分页">
            <p>第 {{ result.page }} / {{ result.totalPages }} 页</p>
            <div>
              <button type="button" :disabled="result.page <= 1" @click="page = result.page - 1">上一页</button>
              <button
                v-for="number in visiblePages"
                :key="number"
                type="button"
                :class="{ 'is-active': number === result.page }"
                :aria-current="number === result.page ? 'page' : undefined"
                @click="page = number"
              >{{ number }}</button>
              <button type="button" :disabled="result.page >= result.totalPages" @click="page = result.page + 1">下一页</button>
            </div>
          </nav>
        </template>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.brand-directory { padding-block: var(--space-section); background: var(--color-bg-light); }
.brand-directory :deep(.content-columns) { margin-top: var(--space-8); }
.brand-directory__panel { overflow: hidden; margin-bottom: var(--space-6); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-page); box-shadow: var(--shadow-sm); }
.brand-directory__search { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: var(--space-4); padding: var(--space-5); }
.brand-directory__search-label { color: var(--color-text-muted); font-size: var(--text-sm); font-weight: 600; }
.brand-directory__search-control { display: flex; align-items: center; gap: var(--space-3); min-width: 0; height: 48px; padding-left: var(--space-4); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-bg-page); }
.brand-directory__search-control:focus-within { border-color: var(--color-primary); }
.brand-directory__search-control svg { flex: 0 0 20px; width: 20px; fill: none; stroke: var(--color-text-muted); stroke-width: 1.8; stroke-linecap: round; }
.brand-directory__search-control input { flex: 1; width: 100%; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; }
.brand-directory__search-control input:focus-visible { border: 0; outline: 0; box-shadow: none; }
.brand-directory__search-control button { align-self: stretch; min-width: 92px; padding-inline: var(--space-5); border: 0; border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--color-primary); color: var(--color-text-on-primary); font-weight: 700; transition: background-color var(--transition-base); }
.brand-directory__search-control button:hover { background: var(--color-primary-dark); }
.brand-directory__tabs { display: flex; gap: var(--space-2); padding: 0 var(--space-5) var(--space-4); }
.brand-directory__tabs button { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border: 1px solid transparent; border-radius: var(--radius-full); background: transparent; color: var(--color-text-muted); font: inherit; font-weight: 600; cursor: pointer; transition: color var(--transition-base), background-color var(--transition-base), border-color var(--transition-base); }
.brand-directory__tabs button:hover { border-color: var(--color-border); color: var(--color-primary); }
.brand-directory__tabs button.is-active { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-text-on-primary); }
.brand-directory__tabs small { min-width: 1.5em; font-size: var(--text-xs); opacity: .8; }
.brand-directory__result-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); color: var(--color-text-muted); font-size: var(--text-sm); }
.brand-directory__result-head p { margin: 0; }
.brand-directory__result-head strong { color: var(--color-text); font-size: var(--text-lg); }
.brand-directory__result-head label { display: flex; align-items: center; gap: var(--space-2); white-space: nowrap; }
.brand-directory__result-head select { min-height: 36px; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-page); color: var(--color-text); }
.brand-directory__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.brand-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-page); box-shadow: var(--shadow-sm); transition: border-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base); }
.brand-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); box-shadow: var(--shadow-md); }
.brand-card__topline { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.brand-card__mark { display: grid; flex: 0 0 44px; width: 44px; height: 44px; place-items: center; border-radius: var(--radius-md); background: var(--color-primary-light); color: var(--color-primary); font-size: var(--text-xl); font-weight: 700; }
.brand-card__types { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.brand-card__types span { padding: 4px 10px; border-radius: var(--radius-full); background: var(--color-bg-light); color: var(--color-primary); font-size: var(--text-xs); font-weight: 600; }
.brand-card__types .brand-card__type-muted { color: var(--color-text-muted); }
.brand-card h2 { overflow-wrap: anywhere; margin-bottom: var(--space-3); font-size: var(--heading-3); }
.brand-card h2 a { color: var(--color-text); text-decoration: none; }
.brand-card h2 a:hover { color: var(--color-primary); }
.brand-card__description { display: -webkit-box; overflow: hidden; min-height: 5em; margin-bottom: var(--space-4); color: var(--color-text-muted); font-size: var(--text-sm); line-height: var(--leading-relaxed); -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.brand-card__footer { display: flex; align-items: center; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: var(--text-sm); }
.brand-card__footer strong { color: var(--color-primary); }
.brand-card__footer a { margin-left: auto; color: var(--color-primary); font-weight: 700; text-decoration: none; }
.brand-directory__state, .brand-directory__empty { padding: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-page); color: var(--color-text-muted); text-align: center; }
.brand-directory__pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-top: var(--space-6); color: var(--color-text-muted); font-size: var(--text-sm); }
.brand-directory__pagination p { margin: 0; }
.brand-directory__pagination > div { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.brand-directory__pagination button { min-height: 38px; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-page); color: var(--color-text); cursor: pointer; }
.brand-directory__pagination button:hover:not(:disabled), .brand-directory__pagination button.is-active { border-color: var(--color-primary); color: var(--color-primary); }
.brand-directory__pagination button.is-active { background: var(--color-primary); color: var(--color-text-on-primary); }
.brand-directory__pagination button:disabled { cursor: not-allowed; opacity: .5; }
@media (max-width: 639px) {
  .brand-directory__search { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); padding: var(--space-4); }
  .brand-directory__search-control button { min-width: 68px; padding-inline: var(--space-3); }
  .brand-directory__tabs { overflow-x: auto; padding-inline: var(--space-4); }
  .brand-directory__tabs button { flex: 0 0 auto; padding-inline: var(--space-3); }
  .brand-directory__grid { grid-template-columns: minmax(0, 1fr); }
  .brand-directory__pagination { justify-content: center; }
}
</style>
