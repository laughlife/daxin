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
/*
 * 需求 2026-10-20：「要 6 行 + 删除底下的白框」。
 * 两列布局下 6 行 = 12 个，因此每页固定 12，不再提供「每页 N 条」选项；
 * 分页条同时移出白色列表面板，底部的白框随之消失。
 */
const PAGE_SIZE = 12

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
const failedLogoSlugs = ref(new Set<string>())

function markLogoFailed(slug: string) {
  failedLogoSlugs.value = new Set([...failedLogoSlugs.value, slug])
}

function brandInitial(name: string): string {
  return Array.from(name.trim())[0] || 'B'
}

function emptyResult(): BrandDirectoryPage {
  return {
    items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1,
    stats: { total: 0, trademark: 0, patent: 0, copyright: 0 },
  }
}

const { data, error, status, refresh } = await useAsyncData(
  () => `brand-directory:${appliedKeyword.value}:${caseType.value}:${page.value}`,
  () => fetchBrandDirectory({
    keyword: appliedKeyword.value,
    caseType: caseType.value || undefined,
    page: page.value,
    pageSize: PAGE_SIZE,
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
  return query
}

watch([appliedKeyword, caseType, page], async () => {
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
  if (nextKeyword !== appliedKeyword.value) {
    appliedKeyword.value = nextKeyword
    keyword.value = nextKeyword
  }
  caseType.value = nextType
  page.value = nextPage
}, { flush: 'sync' })

watch(caseType, () => { page.value = 1 }, { flush: 'sync' })
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
              :data-type="option.value || 'all'"
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
          <section class="brand-directory__list" aria-label="侵权品牌列表">
            <div class="brand-directory__result-head">
              <div class="brand-directory__list-title">
                <h2>侵权品牌列表</h2>
                <span>（共 {{ result.total }} 个品牌）</span>
              </div>
              <!-- 每页固定 6 行（2 列 × 6 = 12 个），不再提供「每页 N 条」下拉 -->
              <p class="brand-directory__page-hint">每页 12 个（6 行）</p>
            </div>

            <p v-if="isLoading" class="brand-directory__state" role="status">正在加载品牌…</p>
            <div v-else-if="result.items.length" class="brand-directory__grid">
              <NuxtLink
                v-for="item in result.items"
                :key="item.slug"
                class="brand-card"
                :to="`/brands/${item.slug}`"
                :aria-label="`查看品牌详情：${item.name}`"
              >
                <div class="brand-card__header">
                  <h3>{{ item.name }}</h3>
                  <div class="brand-card__types">
                    <span v-for="type in item.caseTypes ?? []" :key="type" :data-type="type">{{ CASE_TYPE_LABELS[type] }}</span>
                    <span v-if="!item.caseTypes?.length" class="brand-card__type-muted">侵权类型待确认</span>
                  </div>
                </div>
                <div class="brand-card__body">
                  <div class="brand-card__facts">
                    <p>
                      <svg class="brand-card__fact-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.5" /><path d="M3.5 14a4.5 4.5 0 0 1 9 0" /></svg>
                      <strong>品牌原告：</strong><span :title="item.plaintiff || '暂无公开信息'">{{ item.plaintiff || '暂无公开信息' }}</span>
                    </p>
                    <p>
                      <svg class="brand-card__fact-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14h12M3.5 14V4.5L8 2l4.5 2.5V14M6 6h.1M10 6h.1M6 9h.1M10 9h.1M7 14v-2h2v2" /></svg>
                      <strong>代理律所：</strong><span :title="item.lawFirm || '暂未关联'">{{ item.lawFirm || '暂未关联' }}</span>
            <p v-if="item.ipCategory" class="brand-directory__meta-line">
              <strong>品牌分类：</strong><span>{{ item.ipCategory }}</span>
            </p>
            <p v-if="item.brandOwner" class="brand-directory__meta-line">
              <strong>品牌方：</strong><span>{{ item.brandOwner }}</span>
            </p>
                    </p>
                    <p>
                      <svg class="brand-card__fact-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6.5c0 3.3-5 7.5-5 7.5S3 9.8 3 6.5a5 5 0 1 1 10 0Z" /><circle cx="8" cy="6.5" r="1.5" /></svg>
                      <strong>起诉州：</strong><span>{{ item.stateCode || '未标注' }}</span>
                    </p>
                    <p>
                      <svg class="brand-card__fact-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h6l3 3v9H4zM10 2v3h3M6 8h5M6 11h5" /></svg>
                      <strong>已发案：</strong><span><b>{{ item.caseCount }}</b> 起</span>
                    </p>
                  </div>
                  <div class="brand-card__logo">
                    <img
                      v-if="item.logoUrl && !failedLogoSlugs.has(item.slug)"
                      :src="item.logoUrl"
                      :alt="`${item.name}品牌图片`"
                      loading="lazy"
                      decoding="async"
                      @error="markLogoFailed(item.slug)"
                    >
                    <span v-else aria-hidden="true">{{ brandInitial(item.name) }}</span>
                  </div>
                </div>
                <p v-if="item.description" class="brand-card__description">{{ item.description }}</p>
              </NuxtLink>
            </div>
            <p v-else class="brand-directory__empty" role="status">没有找到符合条件的品牌，请更换关键词或分类。</p>
          </section>

          <!--
            需求 2026-10-20：「要 6 行 + 删除底下的白框」。
            分页条移出白色列表面板，渲染在页面底色上，底部的「白框」随之消失；
            每页固定 12 个（2 列 × 6 行），因此不再提供「每页 N 条」下拉。
          -->
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
/* 分类使用固定纯色：商标蓝、专利绿、版权红，不受站点金色主题影响。 */
.brand-directory__tabs button[data-type='trademark'], .brand-card__types span[data-type='trademark'] { --brand-type-color: #3183cf; --brand-type-soft: #edf6fd; --brand-type-border: #a8d2f0; --brand-type-text: #3183cf; }
.brand-directory__tabs button[data-type='patent'], .brand-card__types span[data-type='patent'] { --brand-type-color: #10b981; --brand-type-soft: #e5f7ef; --brand-type-border: #a7e5c6; --brand-type-text: #10a976; }
.brand-directory__tabs button[data-type='copyright'], .brand-card__types span[data-type='copyright'] { --brand-type-color: #d92d2d; --brand-type-soft: #fce8e8; --brand-type-border: #f2b7b7; --brand-type-text: #d92d2d; }
.brand-directory__tabs button[data-type='trademark'], .brand-directory__tabs button[data-type='patent'], .brand-directory__tabs button[data-type='copyright'] { color: var(--brand-type-text); border-color: var(--brand-type-border); }
.brand-directory__tabs button { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border: 1px solid transparent; border-radius: var(--radius-full); background: transparent; color: var(--color-text-muted); font: inherit; font-family: var(--font-family-base); font-weight: 700; cursor: pointer; transition: color var(--transition-base), background-color var(--transition-base), border-color var(--transition-base); }
.brand-directory__tabs button:hover { border-color: var(--color-border); color: var(--color-primary); }
.brand-directory__tabs button[data-type='trademark']:hover, .brand-directory__tabs button[data-type='patent']:hover, .brand-directory__tabs button[data-type='copyright']:hover { border-color: var(--brand-type-color); color: var(--brand-type-color); }
.brand-directory__tabs button.is-active { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-text-on-primary); }
.brand-directory__tabs button[data-type='trademark'].is-active, .brand-directory__tabs button[data-type='patent'].is-active, .brand-directory__tabs button[data-type='copyright'].is-active { border-color: var(--brand-type-color); background: var(--brand-type-color); color: #fff; }
.brand-directory__tabs small { min-width: 1.5em; font-size: var(--text-xs); opacity: .8; }
.brand-directory__list { padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-page); box-shadow: var(--shadow-sm); }
.brand-directory__result-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); color: var(--color-text-muted); font-size: var(--text-sm); }
.brand-directory__list-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--space-2); }
.brand-directory__list-title h2 { margin: 0; color: var(--color-text); font-size: var(--text-lg); font-weight: 700; }
.brand-directory__list-title span { color: var(--color-text-muted); }
.brand-directory__result-head label { display: flex; align-items: center; gap: var(--space-2); white-space: nowrap; }
.brand-directory__result-head select { min-height: 36px; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-page); color: var(--color-text); }
.brand-directory__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.brand-card { display: flex; min-width: 0; flex-direction: column; padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-page); box-shadow: var(--shadow-sm); color: inherit; text-decoration: none; transition: border-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base); }
.brand-card:hover, .brand-card:focus-visible { transform: translateY(-2px); border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); box-shadow: var(--shadow-md); text-decoration: none; }
.brand-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3); }
.brand-card__header h3 { flex: 1 1 auto; min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: var(--text-lg); line-height: 1.3; }
.brand-card__header h3 { color: var(--color-text); }
.brand-card:hover .brand-card__header h3, .brand-card:focus-visible .brand-card__header h3 { color: var(--color-primary); }
.brand-card__types { display: flex; flex: 0 0 auto; max-width: 45%; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
.brand-card__types span { flex: none; max-width: 100%; padding: 3px 8px; border: 1px solid color-mix(in srgb, var(--color-primary) 24%, white); border-radius: var(--radius-full); background: color-mix(in srgb, var(--color-primary) 8%, white); color: var(--color-primary); font-family: var(--font-family-base); font-size: var(--text-xs); font-weight: 700; text-align: center; white-space: nowrap; }
.brand-card__types span[data-type] { border-color: var(--brand-type-border); background: var(--brand-type-soft); color: var(--brand-type-text); }
.brand-card__types .brand-card__type-muted { color: var(--color-text-muted); }
.brand-card__body { display: grid; grid-template-columns: minmax(0, 1fr) 76px; align-items: center; gap: var(--space-3); min-height: 84px; }
.brand-card__facts { display: grid; gap: 6px; min-width: 0; }
.brand-card__facts p { display: flex; align-items: center; gap: 5px; min-width: 0; margin: 0; color: var(--color-text-muted); font-size: var(--text-xs); line-height: 1.45; }
.brand-card__facts strong { flex: none; color: var(--color-text-muted); font-weight: 500; }
.brand-card__facts p > span { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
.brand-card__facts b { color: var(--color-primary); font-size: var(--text-sm); }
.brand-card__fact-icon { flex: 0 0 14px; width: 14px; height: 14px; fill: none; stroke: var(--color-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.brand-card__logo { display: grid; width: 76px; height: 76px; place-items: center; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: #f6f7f9; }
.brand-card__logo img { width: 100%; height: 100%; object-fit: contain; }
.brand-card__logo span { color: var(--color-primary); font-size: 2rem; font-weight: 750; }
.brand-card__description { display: -webkit-box; overflow: hidden; margin: var(--space-3) 0 0; color: var(--color-text-muted); font-size: var(--text-xs); line-height: var(--leading-relaxed); -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
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
  .brand-directory__list { padding: var(--space-4); }
  .brand-directory__search-control button { min-width: 68px; padding-inline: var(--space-3); }
  .brand-directory__tabs { overflow-x: auto; padding-inline: var(--space-4); }
  .brand-directory__tabs button { flex: 0 0 auto; padding-inline: var(--space-3); }
  .brand-directory__grid { grid-template-columns: minmax(0, 1fr); }
  .brand-directory__pagination { justify-content: center; }
}
</style>
