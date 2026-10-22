<script setup lang="ts">
import type { HomeStat } from '~/types/content'

/**
 * 统计数据区：渲染 HomeStat 列表，
 * emphasis 项使用主色大号数字强调。
 */
defineProps<{
  stats: HomeStat[]
}>()
</script>

<template>
  <ul class="stats-section">
    <li
      v-for="stat in stats"
      :key="stat.value"
      class="stats-section__item"
      :class="{ 'stats-section__item--emphasis': stat.emphasis }"
    >
      <span class="stats-section__value">{{ stat.value }}</span>
      <span class="stats-section__description">{{ stat.description }}</span>
    </li>
  </ul>
</template>

<style scoped>
.stats-section {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-4);
}

.stats-section__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-2);
  background: transparent;
  border: 0;
  text-align: center;
  align-items: center;
}

.stats-section__value {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
}

.stats-section__item--emphasis .stats-section__value {
  font-size: var(--text-3xl);
  color: var(--color-primary);
}

.stats-section__description {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* 平板：3 列 */
@media (max-width: 1023px) {
  .stats-section {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* 移动端：2 列 */
@media (max-width: 639px) {
  .stats-section {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats-section__item:last-child {
    grid-column: 1 / -1;
  }
}
</style>
