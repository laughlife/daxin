<script setup lang="ts">
import type { CaseSearchFilters } from '~/composables/useMockCaseSearch'
import { CASE_TYPE_LABELS } from '~/data/mock/cases'
import type { CaseType } from '~/types/content'

/**
 * TRO 案件查询面板：案件号 / 品牌名 / 代理律所搜索 + 案件类型 / 起诉州筛选。
 * 纯展示组件，搜索状态由 useMockCaseSearch 提供（filters 为 reactive 对象）。
 */
defineProps<{
  /** 来自 useMockCaseSearch 的 reactive 筛选状态 */
  filters: CaseSearchFilters
  /** 起诉州选项 */
  stateOptions: string[]
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
      <div class="case-search-panel__field">
        <label for="case-search-number">案件号</label>
        <input
          id="case-search-number"
          v-model="filters.caseNumber"
          type="search"
          placeholder="如 MOCK-25-cv-9001"
          autocomplete="off"
        >
      </div>
      <div class="case-search-panel__field">
        <label for="case-search-brand">品牌名</label>
        <input
          id="case-search-brand"
          v-model="filters.plaintiffBrand"
          type="search"
          placeholder="如 SnowFox"
          autocomplete="off"
        >
      </div>
      <div class="case-search-panel__field">
        <label for="case-search-firm">代理律所</label>
        <input
          id="case-search-firm"
          v-model="filters.lawFirm"
          type="search"
          placeholder="如 演示律所 Alpha"
          autocomplete="off"
        >
      </div>
      <div class="case-search-panel__field">
        <label for="case-search-type">案件类型</label>
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
      <div class="case-search-panel__field">
        <label for="case-search-state">起诉州</label>
        <select id="case-search-state" v-model="filters.state">
          <option value="">全部州</option>
          <option v-for="state in stateOptions" :key="state" :value="state">
            {{ state }}
          </option>
        </select>
      </div>
    </div>
    <div class="case-search-panel__actions">
      <p class="case-search-panel__hint">
        输入即时筛选，无需提交；查询状态会同步到 URL，刷新后可恢复。
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.case-search-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
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

@media (max-width: 1023px) {
  .case-search-panel__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639px) {
  .case-search-panel {
    padding: var(--space-4);
  }

  .case-search-panel__grid {
    grid-template-columns: 1fr;
  }
}
</style>
