<script setup lang="ts">
import { useMockCaseSearch } from '~/composables/useMockCaseSearch'
import { MOCK_DATA_NOTICE, mockCaseStates } from '~/data/mock/cases'

/**
 * TRO 案件查询页（MVP，本地 Mock 版本）。
 * 搜索 / 筛选 / 分页逻辑全部在 useMockCaseSearch 中，页面不做业务计算；
 * 查询状态同步到 URL query，刷新后可恢复；不调用任何后端接口。
 */
const {
  filters,
  page,
  pagedResults,
  total,
  totalPages,
  hasActiveFilters,
  hasResults,
  setPage,
  resetFilters,
  applyFilter
} = useMockCaseSearch({ pageSize: 8 })

function onFilterByFirm(firm: string) {
  applyFilter('lawFirm', firm)
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

useSeoMeta({
  title: 'TRO 案件查询',
  description:
    'TRO 案件查询演示页：支持按案件号、品牌名、代理律所搜索，并按案件类型与起诉州筛选。当前为本地 Mock 数据，尚未连接真实案件数据库。',
  ogTitle: 'TRO 案件查询 - 大信法务',
  ogDescription:
    '按案件号、品牌、律所与起诉州检索 TRO 案件动态（当前为本地 Mock 演示数据）。'
})
</script>

<template>
  <div class="cases-page">
    <PageContainer>
      <header class="cases-page__head">
        <SectionHeading
          title="TRO 案件查询"
          description="检索 TRO 案件的立案信息、原告品牌、代理律所与案件进展，帮助卖家快速评估风险。"
        />
        <p class="cases-page__notice" role="note">
          {{ MOCK_DATA_NOTICE }}案件号、品牌与律所均为虚构演示数据。
        </p>
      </header>

      <CaseSearchPanel
        :filters="filters"
        :state-options="mockCaseStates"
        :has-active-filters="hasActiveFilters"
        @reset="resetFilters"
      />

      <section class="cases-page__results" aria-label="查询结果" aria-live="polite">
        <p class="cases-page__count">
          共找到 <strong>{{ total }}</strong> 条结果
          <template v-if="hasActiveFilters">（已应用筛选条件）</template>
        </p>

        <template v-if="hasResults">
          <!-- 桌面端表格 -->
          <div class="cases-page__table">
            <CaseTable
              :records="pagedResults"
              @filter-by-firm="onFilterByFirm"
            />
          </div>
          <!-- 移动端卡片列表 -->
          <div class="cases-page__cards">
            <CaseCard
              v-for="record in pagedResults"
              :key="record.id"
              :record="record"
              @filter-by-firm="onFilterByFirm"
            />
          </div>

          <CasePagination
            :page="page"
            :total-pages="totalPages"
            :total="total"
            @update:page="setPage"
          />
        </template>

        <div v-else class="cases-page__empty">
          <p class="cases-page__empty-title">未找到匹配的案件</p>
          <p class="cases-page__empty-desc">
            请尝试更换关键词，或清空搜索条件后浏览全部 Mock 案件。
          </p>
          <BaseButton
            variant="secondary"
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          >
            清空搜索条件
          </BaseButton>
        </div>
      </section>
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

.cases-page__notice {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
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
