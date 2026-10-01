<script setup lang="ts">
import { computed } from 'vue'

/**
 * 案件查询分页条（本地分页，逻辑在 useMockCaseSearch 中复用）。
 * 页码过多时按窗口截取，保证移动端不换行溢出。
 */
const props = defineProps<{
  page: number
  totalPages: number
  total: number
}>()

const emit = defineEmits<{
  'update:page': [page: number]
}>()

const visiblePages = computed<number[]>(() => {
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  let start = Math.max(1, props.page - half)
  const end = Math.min(props.totalPages, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})
</script>

<template>
  <nav
    v-if="totalPages > 1"
    class="case-pagination"
    aria-label="案件查询分页"
  >
    <p class="case-pagination__summary">
      共 {{ total }} 条 Mock 案件，第 {{ page }} / {{ totalPages }} 页
    </p>
    <div class="case-pagination__controls">
      <button
        type="button"
        class="case-pagination__btn"
        :disabled="page <= 1"
        aria-label="上一页"
        @click="emit('update:page', page - 1)"
      >
        ‹ 上一页
      </button>
      <button
        v-for="item in visiblePages"
        :key="item"
        type="button"
        class="case-pagination__btn case-pagination__page"
        :aria-current="item === page ? 'page' : undefined"
        :aria-label="`第 ${item} 页`"
        @click="emit('update:page', item)"
      >
        {{ item }}
      </button>
      <button
        type="button"
        class="case-pagination__btn"
        :disabled="page >= totalPages"
        aria-label="下一页"
        @click="emit('update:page', page + 1)"
      >
        下一页 ›
      </button>
    </div>
  </nav>
</template>

<style scoped>
.case-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-top: var(--space-6);
}

.case-pagination__summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.case-pagination__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.case-pagination__btn {
  min-width: 36px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  font-size: var(--text-sm);
  color: var(--color-text);
  transition:
    border-color var(--transition-base),
    color var(--transition-base),
    background-color var(--transition-base);
}

.case-pagination__btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.case-pagination__btn[aria-current='page'] {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-weight: 600;
}
</style>
