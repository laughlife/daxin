<script setup lang="ts">
import { useCaseSearch } from '~/composables/useCaseSearch'
import { fetchCases } from '~/repositories/cases'

const { today } = useContentDate()
const recentFrom = computed(() => { const date = new Date(`${today.value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 2); return date.toISOString().slice(0, 10) })

/**
 * TRO 案件查询页。
 * 搜索 / 筛选 / 分页全部由服务端完成：页面用 useAsyncData 调用 fetchCases()，
 * 以查询条件作为 key，翻页或改筛选都会重新请求；查询状态同步到 URL query，刷新后可恢复。
 */
const {
  filters,
  page,
  apiQuery,
  queryKey,
  hasActiveFilters,
  setPage,
  resetFilters
} = useCaseSearch({ pageSize: 8 })

const { data, status, error, refresh } = await useAsyncData(
  () => `tro-cases:${queryKey.value}`,
  async () => {
    const first = await fetchCases(apiQuery.value)
    // 服务端会把越界页码夹到最后一页并返回空数组；按夹取后的页码再取一次，
    // 保证直接访问 ?page=9999 时展示的是最后一页内容而不是空结果。
    if (page.value > first.totalPages) {
      return await fetchCases({ ...apiQuery.value, page: first.page })
    }
    return first
  },
  { default: () => null, watch: [queryKey] }
)

const result = computed(() => data.value ?? { items: [], total: 0, page: 1, pageSize: 8, totalPages: 1 })
const isPending = computed(() => status.value === 'pending')
const hasResults = computed(() => result.value.items.length > 0)
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '案件列表加载失败，请稍后重试'
)

/** 客户端把越界页码修正为服务端夹取后的页码，并把 URL 一并修正。 */
if (import.meta.client) {
  watch(data, value => {
    if (value && page.value !== value.page && page.value > value.totalPages) page.value = value.page
  })
}

/** “按此律所筛选”复用关键词搜索（服务端关键词覆盖案件号 / 原告 / 品牌 / 律所）。 */
function onFilterByFirm(firm: string) {
  filters.keyword = firm
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

useSeoMeta({
  title: 'TRO 案件查询',
  description:
    'TRO 历史案件查询：支持按案件号、原告、品牌名与代理律所搜索，并按侵权类型与起诉时间筛选。',
  ogTitle: 'TRO 案件查询 - 大信法务',
  ogDescription:
    '按案件号、原告、品牌与律所检索 TRO 案件动态。'
})
</script>

<template>
  <div class="cases-page">
    <PageContainer>
      <header class="cases-page__head">
        <SectionHeading
          title="TRO 案件查询"
          description="检索 TRO 案件的起诉时间、案件号、代理律所、原告与涉案品牌，帮助卖家快速评估风险。"
        />
      </header>

      <ContentColumns group="tro">
      <nav class="cases-page__shortcuts" aria-label="日期快捷筛选">
        <NuxtLink :to="{ path: '/tro/cases', query: { from: today, to: today } }">今日案件</NuxtLink>
        <NuxtLink :to="{ path: '/tro/cases', query: { from: recentFrom, to: today } }">近三天案件</NuxtLink>
        <NuxtLink to="/tro/cases">全部历史案件</NuxtLink>
      </nav>
      <CaseSearchPanel
        :filters="filters"
        :has-active-filters="hasActiveFilters"
        @reset="resetFilters"
      />

      <section class="cases-page__results" aria-label="查询结果" aria-live="polite">
        <template v-if="error">
          <ErrorState
            title="案件列表加载失败"
            :message="errorMessage"
            @retry="refresh"
          />
        </template>

        <template v-else>
          <p class="cases-page__count">
            共找到 <strong>{{ result.total }}</strong> 条结果
            <template v-if="hasActiveFilters">（已应用筛选条件）</template>
          </p>

          <p v-if="isPending" class="cases-page__loading" role="status">正在加载案件数据…</p>

          <template v-if="hasResults">
            <!-- 桌面端表格 -->
            <div class="cases-page__table">
              <CaseTable
                :records="result.items"
                @filter-by-firm="onFilterByFirm"
              />
            </div>
            <!-- 移动端卡片列表 -->
            <div class="cases-page__cards">
              <CaseCard
                v-for="record in result.items"
                :key="record.id"
                :record="record"
                @filter-by-firm="onFilterByFirm"
              />
            </div>

            <CasePagination
              :page="result.page"
              :total-pages="result.totalPages"
              :total="result.total"
              @update:page="setPage"
            />
          </template>

          <div v-else-if="!isPending" class="cases-page__empty">
            <p class="cases-page__empty-title">未找到匹配的案件</p>
            <p class="cases-page__empty-desc">
              请尝试更换关键词或调整筛选条件，也可以清空条件后浏览全部历史案件。
            </p>
            <BaseButton
              variant="secondary"
              :disabled="!hasActiveFilters"
              @click="resetFilters"
            >
              清空搜索条件
            </BaseButton>
          </div>
        </template>
      </section>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.cases-page {
  padding-block: var(--space-10) var(--space-16);
  background-color: var(--color-bg-light);
  min-height: 60vh;
}

.cases-page__head {
  margin-bottom: var(--space-6);
}

.cases-page__results {
  margin-top: var(--space-6);
}

.cases-page__count {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.cases-page__count strong {
  color: var(--color-primary);
}

.cases-page__loading {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.cases-page__cards {
  display: none;
}

.cases-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-16) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.cases-page__empty-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
}

.cases-page__empty-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* 移动端：表格换成卡片列表 */
@media (max-width: 767px) {
  .cases-page__table {
    display: none;
  }

  .cases-page__cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
}
</style>

<style scoped>
.cases-page__shortcuts { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.cases-page__shortcuts a { font-size:14px; padding:8px 14px; border:1px solid var(--color-border); border-radius:8px; background:white; }
</style>
