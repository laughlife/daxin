<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * 文章预览弹层。
 *
 * 为什么抽成组件：编辑器里原本内联了一份预览（标题/白名单清洗后的正文），
 * 需求又要求在**文章列表**上也提供预览。两处各写一份必然出现
 * 「编辑器里清洗了、列表里没清洗」这类安全口径不一致，因此统一到这里。
 *
 * 正文一律经过 sanitizeHtml 白名单清洗后再交给 RichArticleBody 渲染，
 * 避免把未经清洗的存储内容直接塞进后台 DOM。
 */
const props = withDefaults(defineProps<{
  /** 是否显示 */
  open: boolean
  title: string
  /** 未清洗的正文 HTML，组件内部会做白名单清洗 */
  contentHtml?: string
  /** 头部元信息，例如「TRO 资讯 · 2026-10-12 · 大信法务」 */
  meta?: string
  /** 内容加载中（列表里需要先取详情） */
  loading?: boolean
  /** 加载失败提示 */
  error?: string
}>(), {
  contentHtml: '',
  meta: '',
  loading: false,
  error: '',
})

const emit = defineEmits<{
  close: []
}>()

const sanitizedHtml = computed(() => sanitizeHtml(props.contentHtml ?? ''))

/** Esc 关闭：弹层打开时挂到 document，关闭或卸载时移除，避免监听泄漏。 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(() => props.open, (open) => {
  if (typeof document === 'undefined') return
  if (open) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
}, { immediate: true })

onMounted(() => {
  if (props.open && typeof document !== 'undefined') document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="open" class="admin-article-preview-backdrop" role="presentation" @click.self="emit('close')">
    <article
      class="admin-article-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-article-preview-title"
    >
      <header class="admin-article-preview__head">
        <span>{{ meta || '预览' }}</span>
        <button type="button" aria-label="关闭预览" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="admin-article-preview__status" role="status">正在加载文章内容…</p>
      <p v-else-if="error" class="admin-article-preview__error" role="alert">{{ error }}</p>
      <template v-else>
        <h2 id="admin-article-preview-title">{{ title || '未填写标题' }}</h2>
        <RichArticleBody v-if="sanitizedHtml" :html="sanitizedHtml" />
        <p v-else class="admin-article-preview__empty">暂无正文内容</p>
      </template>
    </article>
  </div>
</template>

<!--
  样式不加 scoped：本组件会被不同页面复用（编辑器与列表），
  且弹层挂在页面外层，用全局类名更稳妥，避免 scoped 作用域错配。
  类名带 admin-article-preview 前缀，不会与其它页面冲突。
-->
<style>
.admin-article-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: rgb(15 23 42 / 55%);
}
.admin-article-preview {
  width: min(900px, 100%);
  max-height: min(90vh, 100%);
  overflow: auto;
  padding: var(--space-8);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
  box-shadow: var(--shadow-lg);
}
.admin-article-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.admin-article-preview__head button {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}
.admin-article-preview h2 { font-size: var(--heading-1); line-height: var(--leading-tight); }
.admin-article-preview__empty,
.admin-article-preview__status { margin-top: var(--space-6); color: var(--color-text-muted); }
.admin-article-preview__error { margin-top: var(--space-6); color: var(--color-error); }
</style>
