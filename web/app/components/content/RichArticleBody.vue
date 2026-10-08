<script setup lang="ts">
import type { ArticleContent } from '~/repositories/articleContent'
defineProps<{ content: ArticleContent }>()
// 此字段由导入清洗器生成；未来 API 必须在服务端执行等价的标签、属性与资源校验。
</script>

<template>
  <div class="rich-article-body" v-html="content.html" />
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
