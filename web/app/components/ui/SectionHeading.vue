<script setup lang="ts">
import { computed } from 'vue'

/**
 * 区块标题：统一的标题 + 描述 + 装饰线。
 */
const props = withDefaults(
  defineProps<{
    /** 标题文本（也可通过 title 插槽传入） */
    title?: string
    /** 描述文本 */
    description?: string
    /** 标题层级 1-4 */
    level?: 1 | 2 | 3 | 4
    /** 对齐方式 */
    align?: 'left' | 'center'
  }>(),
  {
    title: '',
    description: '',
    level: 2,
    align: 'left'
  }
)

const headingTag = computed(() => `h${props.level}`)

const rootClass = computed(() => [
  'section-heading',
  `section-heading--${props.align}`
])
</script>

<template>
  <div :class="rootClass">
    <component :is="headingTag" class="section-heading__title">
      <slot name="title">{{ title }}</slot>
    </component>
    <span class="section-heading__bar" aria-hidden="true" />
    <p v-if="description || $slots.description" class="section-heading__description">
      <slot name="description">{{ description }}</slot>
    </p>
  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-heading--center {
  align-items: center;
  text-align: center;
}

.section-heading__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.section-heading__bar {
  width: 48px;
  height: 3px;
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
}

.section-heading--center .section-heading__bar {
  margin-inline: auto;
}

.section-heading__description {
  color: var(--color-text-muted);
  font-size: var(--text-base);
  max-width: 72ch;
}
</style>
