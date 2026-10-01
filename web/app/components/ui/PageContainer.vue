<script setup lang="ts">
import { computed } from 'vue'

/**
 * 页面容器：统一内容最大宽度与左右内边距。
 * 宽度档位与内边距全部来自设计令牌（tokens.css）。
 */
const props = withDefaults(
  defineProps<{
    /** 宽度档位 */
    size?: 'default' | 'narrow' | 'wide'
    /** 渲染的容器标签 */
    as?: string
  }>(),
  {
    size: 'default',
    as: 'div'
  }
)

const containerClass = computed(() => [
  'page-container',
  props.size !== 'default' ? `page-container--${props.size}` : ''
])
</script>

<template>
  <component :is="as" :class="containerClass">
    <slot />
  </component>
</template>
