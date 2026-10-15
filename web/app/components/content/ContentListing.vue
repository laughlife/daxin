<script setup lang="ts">
import { fetchArticles } from '~/repositories/articles'
import type { ArticleSummary } from '~/repositories/articles'
import type { ContentSection } from '~/config/contentSections'

/**
 * 栏目列表页。
 *
 * 文章来自 `~/repositories/articles` 的 fetchArticles()：关键词、发布日期与分页都由
 * 服务端处理；查询条件同步到 URL query（q/from/to/page），刷新后可恢复。
 * 栏目没有对应分类（section.category 为空）时直接展示空状态，不会列出全部文章。
 */
const props = defineProps<{ section: ContentSection }>()

const PAGE_SIZE = 6
const route = useRoute()
const router = useRouter()

// 静态预渲染不含 URL query：首次水合保持同一 DOM，挂载后再应用查询条件。
let ready = !(import.meta.client && useNuxtApp().payload.prerenderedAt)
const initialQuery: typeof route.query = ready ? route.query : {}

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0]! : ''
  return typeof value === 'string' ? value : ''
}

function queryPage(value: unknown): number {
  const parsed = Number(queryString(value))
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
}

const keyword = ref(queryString(initialQuery.q))
const from = ref(queryString(initialQuery.from))
const to = ref(queryString(initialQuery.to))
const page = ref(queryPage(initialQuery.page))

const invalidRange = computed(() => Boolean(from.value && to.value && from.value > to.value))

function emptyPage(): { items: ArticleSummary[]; total: number; page: number; pageSize: number; totalPages: number } {
  return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 }
}

const { data, status, error, refresh } = await useAsyncData(
  () => `content-listing:${props.section.path}:${keyword.value}:${from.value}:${to.value}:${page.value}`,
  async () => {
    if (!props.section.category || invalidRange.value) return emptyPage()
    const first = await fetchArticles({
      category: props.section.category,
      keyword: keyword.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      page: page.value,
      pageSize: PAGE_SIZE
    })
    // 服务端会把越界页码夹到最后一页并返回空数组；按夹取后的页码再取一次。
    if (page.value > first.totalPages) {
      return await fetchArticles({
        category: props.section.category,
        keyword: keyword.value.trim() || undefined,
        from: from.value || undefined,
        to: to.value || undefined,
        page: first.page,
        pageSize: PAGE_SIZE
      })
    }
    return first
  },
  { default: () => null, watch: [() => props.section.path, keyword, from, to, page] }
)

const result = computed(() => data.value ?? emptyPage())
const isPending = computed(() => status.value === 'pending')
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '文章列表加载失败，请稍后重试'
)

/** 筛选条件变化时回到第一页 */
watch([keyword, from, to], () => { page.value = 1 }, { flush: 'sync' })

/** 客户端把越界页码修正为服务端夹取后的页码，并把 URL 一并修正。 */
if (import.meta.client) {
  watch(data, value => {
    if (value && page.value !== value.page && page.value > value.totalPages) page.value = value.page
  })
}

function buildQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (keyword.value.trim()) query.q = keyword.value.trim()
  if (from.value) query.from = from.value
  if (to.value) query.to = to.value
  if (page.value > 1) query.page = String(page.value)
  return query
}

function readQuery(query: typeof route.query) {
  keyword.value = queryString(query.q)
  from.value = queryString(query.from)
  to.value = queryString(query.to)
  page.value = queryPage(query.page)
}

function syncUrl() {
  if (!import.meta.client || !ready) return
  const query = buildQuery()
  if (Object.keys(query).length !== Object.keys(route.query).length || Object.entries(query).some(([key, value]) => route.query[key] !== value)) {
    void router.replace({ query })
  }
}

watch([keyword, from, to, page], syncUrl, { flush: 'post', immediate: true })
watch(() => route.query, query => { if (ready) readQuery(query) }, { flush: 'sync' })
onMounted(() => {
  ready = true
  readQuery(route.query)
  syncUrl()
})

function reset() {
  keyword.value = ''
  from.value = ''
  to.value = ''
  page.value = 1
}

const eyebrow = computed(() => props.section.path.startsWith('/tro') ? 'TRO SERVICES' : props.section.path.startsWith('/domestic') ? 'DOMESTIC SERVICES' : 'KNOWLEDGE CENTER')
</script>

<template>
  <div class="listing-page">
    <PageContainer>
      <header class="listing-page__head">
        <p class="listing-page__eyebrow">{{ eyebrow }}</p>
        <SectionHeading :level="1" :title="section.title" />
      </header>
      <ContentColumns :group="section.group">
        <ContentSectionTabs :path="section.path" />

        <form class="listing-search" role="search" @submit.prevent>
          <label>关键词<input v-model="keyword" type="search" placeholder="标题、案件号、品牌名或律所名"></label>
          <label>发布日期从<input v-model="from" type="date" :max="to || undefined"></label>
          <label>发布日期至<input v-model="to" type="date" :min="from || undefined"></label>
          <button type="button" @click="reset">清空</button>
        </form>
        <p v-if="invalidRange" class="listing-notice" role="alert">开始日期不能晚于结束日期。</p>

        <ErrorState
          v-if="error"
          title="文章列表加载失败"
          :message="errorMessage"
          @retry="refresh"
        />

        <template v-else>
          <p class="listing-notice">共 {{ result.total }} 篇 · {{ result.total ? '公开资料' : '暂无对应文章' }}</p>
          <p v-if="isPending" class="listing-notice" role="status">正在加载文章…</p>
          <ArticleList :articles="result.items" />
          <CasePagination
            :page="result.page"
            :total-pages="result.totalPages"
            :total="result.total"
            noun="篇文章"
            @update:page="page = $event"
          />
        </template>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.listing-page { padding-block:var(--space-section); background:var(--color-bg-light); }
.listing-page__head { margin-bottom:var(--space-8); }
.listing-page__eyebrow { margin-bottom:var(--space-3); color:var(--color-primary); font-size:var(--text-sm); font-weight:700; letter-spacing:.12em; }
.listing-search { display:grid; grid-template-columns:minmax(0,2fr) minmax(140px,1fr) minmax(140px,1fr) auto; gap:var(--space-4); padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
label { display:flex; min-width:0; flex-direction:column; gap:var(--space-2); font-size:var(--text-sm); color:var(--color-text-muted); }
input { width:100%; min-width:0; }
button { align-self:end; min-height:48px; padding:var(--space-3) var(--space-5); border:1px solid var(--color-primary); border-radius:var(--radius-control); background:var(--color-primary); color:var(--color-text-on-primary); font-weight:600; transition:background-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base); }
button:hover { background:var(--color-primary-dark); box-shadow:var(--shadow-sm); transform:translateY(-1px); }
.listing-notice { margin:var(--space-5) 0; color:var(--color-text-muted); font-size:var(--text-sm); }
@media(max-width:767px) { .listing-search { grid-template-columns:repeat(2,minmax(0,1fr)); } label:first-child { grid-column:1/-1; } }
@media(max-width:639px) { .listing-search { gap:var(--space-3); padding:var(--space-4); } }
</style>
