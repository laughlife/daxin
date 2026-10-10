<script setup lang="ts">
import type { BusinessCard } from '~/types/content'

/**
 * 首页业务卡片：标题 + 简介 + 业务条目。
 * iconKey 映射为内置几何 SVG 占位图标（不使用正式素材、不伪造 Logo）。
 * hover 与 focus-visible 均有明显状态。
 *
 * 需求只要求首页第一块业务（TRO 与链接维权）跳转 TRO 成功案例，其余三块不提供入口，
 * 因此「了解详情」由 card.detailLinkLabel 显式控制，而不是每块都渲染链接。
 */
const props = defineProps<{
  card: BusinessCard
}>()

/**
 * 把成绩文案切成「普通文本 / 高亮文本」片段，用于把关键短语单独加粗放大。
 * 用 indexOf 切分而不是正则，避免短语里出现正则元字符时失效。
 */
const achievementParts = computed(() => {
  const text = props.card.achievement ?? ''
  const key = props.card.achievementHighlight ?? ''
  if (!text) return []
  if (!key) return [{ text, highlight: false }]
  const index = text.indexOf(key)
  if (index === -1) return [{ text, highlight: false }]
  return [
    { text: text.slice(0, index), highlight: false },
    { text: key, highlight: true },
    { text: text.slice(index + key.length), highlight: false },
  ].filter((part) => part.text !== '')
})

/** 内置占位图标（几何线条，非正式品牌素材） */
const iconPaths: Record<BusinessCard['iconKey'], string[]> = {
  scale: ['M12 4v16', 'M7 20h10', 'M4 8h16', 'M4 8 2 13h4L4 8Z', 'M20 8l-2 5h4l-2-5Z'],
  shield: ['M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5l8-3Z'],
  document: ['M6 2h8l4 4v16H6V2Z', 'M14 2v4h4', 'M9 12h6', 'M9 16h6'],
  briefcase: ['M3 7h18v13H3V7Z', 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M3 12h18']
}
</script>

<template>
  <article class="business-card">
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
    <!-- 成绩文案整体可点击跳转成功案例，其中关键短语加粗放大（需求 2026-10-10）。 -->
    <template v-if="card.achievement">
      <NuxtLink
        v-if="card.href"
        class="business-card__achievement"
        :to="card.href"
      >
        <template v-for="(part, index) in achievementParts" :key="index">
          <strong v-if="part.highlight" class="business-card__achievement-key">{{ part.text }}</strong>
          <template v-else>{{ part.text }}</template>
        </template>
      </NuxtLink>
      <p v-else class="business-card__achievement">{{ card.achievement }}</p>
    </template>
    <ul v-if="card.items.length > 0" class="business-card__items">
      <li v-for="item in card.items" :key="item">
        <span class="business-card__dot" aria-hidden="true" />
        {{ item }}
      </li>
    </ul>
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

/* 成绩文案：与其它卡片正文同级排版，不做整块变色强调（需求 2026-10-10） */
.business-card__achievement {
  display: block;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--color-text);
}

a.business-card__achievement:hover {
  color: var(--color-primary);
}

/* 关键短语（如「0赔偿撤诉」）加粗放大 */
.business-card__achievement-key {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-primary);
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
</style>

