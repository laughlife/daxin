<script setup lang="ts">
/**
 * 通用错误状态块：接口失败时展示可理解的中文提示，并提供重试入口。
 * 失败时绝不回退到演示数据，也不渲染空白页。
 */
withDefaults(defineProps<{
  /** 错误标题 */
  title?: string
  /** 具体错误信息（通常来自仓储抛出的中文 Error） */
  message: string
  /** 是否显示重试按钮 */
  retryable?: boolean
}>(), {
  title: '数据加载失败',
  retryable: true
})

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="error-state" role="alert">
    <p class="error-state__title">{{ title }}</p>
    <p class="error-state__message">{{ message }}</p>
    <p class="error-state__hint">请稍后重试；若持续失败，可通过页面底部联系方式与我们联系。</p>
    <button
      v-if="retryable"
      type="button"
      class="error-state__retry"
      @click="emit('retry')"
    >
      重新加载
    </button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.error-state__title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
}

.error-state__message {
  font-size: var(--text-sm);
  color: var(--color-error);
  line-height: var(--leading-relaxed);
}

.error-state__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.error-state__retry {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-5);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
  transition: background-color var(--transition-base);
}

.error-state__retry:hover {
  background-color: var(--color-primary-light);
}
</style>
