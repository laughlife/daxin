<script setup lang="ts">
import { computed } from 'vue'

/**
 * 基础按钮：传入 to 时渲染为 NuxtLink，否则渲染为原生 button。
 * 颜色、圆角、间距全部来自设计令牌。
 */
const props = withDefaults(
  defineProps<{
    /** 视觉风格 */
    variant?: 'primary' | 'secondary' | 'ghost'
    /** 尺寸 */
    size?: 'sm' | 'md' | 'lg'
    /** 路由地址；提供时渲染为链接 */
    to?: string | Record<string, unknown> | null
    /** 原生 button 类型（未传 to 时生效） */
    type?: 'button' | 'submit' | 'reset'
    /** 禁用状态（仅原生 button） */
    disabled?: boolean
    /** 是否撑满容器宽度 */
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    to: null,
    type: 'button',
    disabled: false,
    block: false
  }
)

const buttonClass = computed(() => [
  'btn',
  `btn--${props.variant}`,
  `btn--${props.size}`,
  { 'btn--block': props.block }
])
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="buttonClass">
    <slot />
  </NuxtLink>
  <button v-else :type="type" :disabled="disabled" :class="buttonClass">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base);
}

.btn:hover {
  text-decoration: none;
}

/* 尺寸 */
.btn--sm {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}

.btn--md {
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-base);
}

.btn--lg {
  padding: var(--space-4) var(--space-6);
  font-size: var(--text-lg);
}

/* 风格 */
.btn--primary {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn--primary:hover {
  background-color: var(--color-primary-dark);
  color: var(--color-text-on-primary);
}

.btn--secondary {
  background-color: transparent;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn--secondary:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.btn--ghost {
  background-color: transparent;
  color: var(--color-text);
}

.btn--ghost:hover {
  background-color: var(--color-bg-light);
  color: var(--color-primary);
}

.btn--block {
  display: flex;
  width: 100%;
}
</style>
