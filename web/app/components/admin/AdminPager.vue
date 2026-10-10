<script setup lang="ts">
import { computed } from 'vue'

/**
 * 后台列表分页条。
 *
 * 页码窗口与展示口径与 `cases/CasePagination.vue` 一致，但后台列表要求：
 *   - 必须展示服务端 `meta.total` / `meta.totalPages`，不自行估算；
 *   - 提供每页条数切换（服务端上限 48），方便管理员翻查大量品牌 / 律所。
 * 总数与总页数全部来自父组件传入的 meta，本组件不做任何本地推算。
 */
const props = withDefaults(defineProps<{
  /** 当前页（服务端夹取后的值） */
  page: number
  /** 总页数（服务端 meta.totalPages） */
  totalPages: number
  /** 总条数（服务端 meta.total） */
  total: number
  /** 每页条数（服务端 meta.pageSize） */
  pageSize: number
  /** 计量单位，例如「篇文章」 */
  noun?: string
  /** 可选的每页条数档位 */
  pageSizes?: number[]
  /** 是否禁用（只读角色仍然允许翻页，因此默认 false） */
  disabled?: boolean
}>(), {
  noun: '条记录',
  pageSizes: () => [20, 48],
  disabled: false
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
}>()

/** 当前页附近的页码窗口，最多展示 5 个页码 */
const visiblePages = computed<number[]>(() => {
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  let start = Math.max(1, props.page - half)
  const end = Math.min(Math.max(1, props.totalPages), start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
})

const hasPages = computed(() => props.totalPages > 1)
</script>

<template>
  <nav class="admin-pager" aria-label="列表分页">
    <p class="admin-pager__summary" role="status">
      共 {{ total }} {{ noun }}，第 {{ page }} / {{ totalPages }} 页
    </p>

    <div class="admin-pager__controls">
      <label class="admin-pager__size">
        <span>每页</span>
        <select
          class="admin-pager__select"
          :value="pageSize"
          :disabled="disabled"
          @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} 条</option>
        </select>
      </label>

      <template v-if="hasPages">
        <button
          type="button"
          class="admin-pager__btn"
          :disabled="disabled || page <= 1"
          aria-label="上一页"
          @click="emit('update:page', page - 1)"
        >
          ‹ 上一页
        </button>
        <button
          v-for="item in visiblePages"
          :key="item"
          type="button"
          class="admin-pager__btn admin-pager__page"
          :aria-current="item === page ? 'page' : undefined"
          :aria-label="`第 ${item} 页`"
          :disabled="disabled"
          @click="emit('update:page', item)"
        >
          {{ item }}
        </button>
        <button
          type="button"
          class="admin-pager__btn"
          :disabled="disabled || page >= totalPages"
          aria-label="下一页"
          @click="emit('update:page', page + 1)"
        >
          下一页 ›
        </button>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.admin-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.admin-pager__summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-pager__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-pager__size {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-pager__select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-sm);
}

.admin-pager__btn {
  min-width: 36px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-size: var(--text-sm);
  transition:
    border-color var(--transition-base),
    color var(--transition-base),
    background-color var(--transition-base);
}

.admin-pager__btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.admin-pager__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-pager__btn[aria-current='page'] {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-weight: 600;
}
</style>
