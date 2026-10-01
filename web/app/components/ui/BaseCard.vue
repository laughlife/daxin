<script setup lang="ts">
import { computed } from 'vue'

/**
 * 基础卡片：统一的圆角、边框、阴影容器。
 * 支持标题（prop 或插槽）、默认内容插槽与 footer 插槽。
 */
const props = withDefaults(
  defineProps<{
    /** 卡片标题（也可通过 title 插槽传入） */
    title?: string
    /** 标题层级 1-6，默认 h3 */
    titleLevel?: 1 | 2 | 3 | 4 | 5 | 6
    /** 是否可交互（hover 提升阴影） */
    interactive?: boolean
  }>(),
  {
    title: '',
    titleLevel: 3,
    interactive: false
  }
)

const titleTag = computed(() => `h${props.titleLevel}`)

const cardClass = computed(() => [
  'base-card',
  { 'base-card--interactive': props.interactive }
])
</script>

<template>
  <article :class="cardClass">
    <header v-if="title || $slots.title" class="base-card__header">
      <component :is="titleTag" class="base-card__title">
        <slot name="title">{{ title }}</slot>
      </component>
    </header>
    <div class="base-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="base-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>

<style scoped>
.base-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.base-card--interactive:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.base-card__title {
  font-size: var(--text-lg);
  color: var(--color-text);
}

.base-card__body {
  color: var(--color-text-muted);
  font-size: var(--text-base);
}

.base-card__footer {
  margin-top: auto;
  padding-top: var(--space-2);
}
</style>
