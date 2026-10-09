<script setup lang="ts">
/**
 * 富文本正文：直接渲染接口清洗后的 HTML（GET /api/public/articles/[slug] 的 `html`）。
 * 清洗在服务端完成（server/utils/public/sanitize.ts），此处不再二次解析。
 */
defineProps<{ html: string }>()
</script>

<template>
  <div class="rich-article-body" v-html="html" />
</template>

<style scoped>
.rich-article-body { margin-top:28px; font-size:16px; line-height:1.9; overflow-wrap:anywhere; }
.rich-article-body :deep(*) { max-width:100% !important; box-sizing:border-box; }
.rich-article-body :deep(p) { margin-block:12px; }
.rich-article-body :deep(img) { max-width:100% !important; height:auto !important; object-fit:contain; vertical-align:middle; }
.rich-article-body :deep(table) { max-width:100%; border-collapse:collapse; }
.rich-article-body :deep(td), .rich-article-body :deep(th) { overflow-wrap:anywhere; }
.rich-article-body :deep(ul), .rich-article-body :deep(ol) { padding-left:1.5em; }
@media(max-width:639px) { .rich-article-body { font-size:15px; } }
</style>
