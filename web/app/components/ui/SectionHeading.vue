<script setup lang="ts">
import { computed } from 'vue'

/**
 * 区块标题：统一的标题 + 描述 + 装饰线。
 *
 * eyebrow 为标题上方的英文小字（如 TRO SUCCESS STORIES / COMPANY PRESENTATION），
 * 旧站各区块的英文副标题就是这个位置；不传时不渲染，不影响既有调用。
 */
const props = withDefaults(
  defineProps<{
    /** 标题上方的英文小字（可选） */
    eyebrow?: string
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
    eyebrow: '',
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
    <p v-if="eyebrow" class="section-heading__eyebrow">{{ eyebrow }}</p>
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

/* 英文副标题：复刻旧站的「两侧红线 + 红色大写小字」样式
   （旧站 h4.sub-title.top-line 为 20px/500、色 #cb0003，两侧 60×2px 红线）。 */
.section-heading__eyebrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  font-size: var(--text-lg);
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.section-heading__eyebrow::before,
.section-heading__eyebrow::after {
  content: '';
  flex: none;
  width: 60px;
  height: 2px;
  background-color: var(--color-primary);
}

/* 左对齐时红线只保留右侧一条，避免与左侧内容顶在一起 */
.section-heading--left .section-heading__eyebrow {
  justify-content: flex-start;
}

.section-heading--left .section-heading__eyebrow::before {
  display: none;
}

/* 区块大标题：沿用全站尺度；需要旧站 36px 尺度时由页面局部覆盖
   （见 about.vue 的 :deep(.section-heading__title)），避免改动影响其它页面。 */
.section-heading__title {
  font-size: var(--text-3xl);
  font-weight: 700;
  line-height: 1.2;
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
