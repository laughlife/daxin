<script setup lang="ts">
import type { BusinessCard } from '~/types/content'

/**
 * 首页业务卡片：标题 + 简介 + 业务条目 + 入口链接。
 * iconKey 映射为内置几何 SVG 占位图标（不使用正式素材、不伪造 Logo）。
 * hover 与 focus-visible 均有明显状态。
 */
const props = defineProps<{
  card: BusinessCard
}>()

/** 内置占位图标（几何线条，非正式品牌素材） */
const iconPaths: Record<BusinessCard['iconKey'], string[]> = {
  scale: ['M12 4v16', 'M7 20h10', 'M4 8h16', 'M4 8 2 13h4L4 8Z', 'M20 8l-2 5h4l-2-5Z'],
  shield: ['M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5l8-3Z'],
  document: ['M6 2h8l4 4v16H6V2Z', 'M14 2v4h4', 'M9 12h6', 'M9 16h6'],
  briefcase: ['M3 7h18v13H3V7Z', 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M3 12h18']
}
</script>

<template>
  <article
    class="business-card"
    :class="{ 'business-card--accent': card.accent }"
  >
    <span class="business-card__icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path v-for="(d, i) in iconPaths[card.iconKey]" :key="i" :d="d" />
      </svg>
    </span>
    <h3 class="business-card__title">{{ card.title }}</h3>
    <p class="business-card__summary">{{ card.summary }}</p>
    <ul class="business-card__items">
      <li v-for="item in card.items" :key="item">
        <span class="business-card__dot" aria-hidden="true" />
        {{ item }}
      </li>
    </ul>
    <NuxtLink :to="card.href" class="business-card__link">
      了解详情
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </article>
</template>

<style scoped>
.business-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base),
    border-color var(--transition-base);
}

.business-card:hover,
.business-card:focus-within {
  box-shadow: var(--shadow-md);
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}

.business-card--accent {
  border-top: 3px solid var(--color-primary);
}

.business-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.business-card__title {
  font-size: var(--text-lg);
  color: var(--color-text);
}

.business-card__summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.business-card__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text);
}

.business-card__items li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.business-card__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
}

.business-card__link {
  margin-top: auto;
  padding-top: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.business-card__link:hover {
  color: var(--color-primary-dark);
}
</style>
