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
      :key="`${stat.value}-${stat.label}`"
      class="stats-section__item"
    >
      <span class="stats-section__value">{{ stat.value }}</span>
      <span class="stats-section__label">{{ stat.label }}</span>
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
  align-items: center;
  gap: 0;
  min-width: 0;
  padding: 0 var(--space-2);
  background: transparent;
  border: 0;
  text-align: center;
}

.stats-section__value {
  color: #3B3838;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2.25rem, 4vw, 3.5rem);
  font-weight: 500;
  line-height: 1.15;
}

.stats-section__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  margin-top: var(--space-4);
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-full);
  background: #EEAF4E;
  color: #fff;
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.2;
}

.stats-section__description {
  max-width: 13em;
  min-height: 3.2em;
  margin-top: var(--space-2);
  color: #626060;
  font-size: var(--text-sm);
  line-height: 1.6;
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
