<script setup lang="ts">
import type { CaseSearchFilters } from '~/composables/useCaseSearch'
import { CASE_TYPE_LABELS } from '~/utils/caseTypeLabel'
import type { CaseType } from '~/types/content'

/**
 * TRO 案件查询面板：关键词搜索 + 侵权类型 / 起诉时间筛选。
 * 纯展示组件，搜索状态由 useCaseSearch 提供（filters 为 reactive 对象）。
 * 起诉州没有对应数据，已从界面移除；案件类型筛选直接下发服务端真实类型字段。
 * 起诉时间按需求（2026-10-10）只保留**一个**选择框，不再用「从 / 至」两个框。
 */
const props = defineProps<{
  /** 来自 useCaseSearch 的 reactive 筛选状态 */
  filters: CaseSearchFilters
  /** 是否有生效中的条件 */
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  reset: []
}>()

const caseTypeOptions: Array<{ value: CaseType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  { value: 'trademark', label: CASE_TYPE_LABELS.trademark },
  { value: 'patent', label: CASE_TYPE_LABELS.patent },
  { value: 'copyright', label: CASE_TYPE_LABELS.copyright }
]
</script>

<template>
  <form
    class="case-search-panel"
    role="search"
    aria-label="TRO 案件搜索"
    @submit.prevent
  >
    <div class="case-search-panel__grid">
      <div class="case-search-panel__field case-search-panel__field--full">
        <label for="case-search-keyword">关键词</label>
        <input
          id="case-search-keyword"
          v-model="filters.keyword"
          type="search"
          placeholder="案件号、原告、品牌名或代理律所，如 25-cv-00126 / Keith"
          autocomplete="off"
        >
      </div>
      <div class="case-search-panel__field case-search-panel__field--full">
        <label for="case-search-type">侵权类型</label>
        <select id="case-search-type" v-model="filters.caseType">
          <option
            v-for="option in caseTypeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="case-search-panel__field case-search-panel__field--full">
        <label for="case-search-date">起诉时间</label>
        <input
          id="case-search-date"
          v-model="filters.date"
          type="date"
          aria-describedby="case-search-date-hint"
        >
        <span id="case-search-date-hint" class="case-search-panel__field-hint">显示该日期及之后立案的案件</span>
      </div>
    </div>
    <div class="case-search-panel__actions">
      <p class="case-search-panel__hint">
        输入即时筛选，无需提交；查询条件会同步到 URL，刷新后可恢复。
      </p>
      <button
        type="button"
        class="case-search-panel__reset"
        :disabled="!hasActiveFilters"
        @click="emit('reset')"
      >
        清空搜索条件
      </button>
    </div>
  </form>
</template>

<style scoped>
.case-search-panel {
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.case-search-panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}

.case-search-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.case-search-panel__field--full {
  grid-column: 1 / -1;
}

.case-search-panel__field-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.case-search-panel__field label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.case-search-panel__field input,
.case-search-panel__field select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  font: inherit;
  font-size: var(--text-sm);
  color: var(--color-text);
}

.case-search-panel__field input:focus-visible,
.case-search-panel__field select:focus-visible {
  border-color: var(--color-primary);
}

.case-search-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-top: var(--space-4);
}

.case-search-panel__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.case-search-panel__reset {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
  transition: background-color var(--transition-base);
}

.case-search-panel__reset:hover:not(:disabled) {
  background-color: var(--color-primary-light);
}

@media (max-width: 639px) {
  .case-search-panel {
    padding: var(--space-4);
  }

}
</style>
