<script setup lang="ts">
import type { ArticleSummary } from '~/repositories/articles'
defineProps<{ articles: ArticleSummary[] }>()
</script>
<template>
  <div class="article-list"><article v-for="article in articles" :key="article.id" class="article-list__card"><div class="article-list__meta"><span>{{ article.category }}</span><time :datetime="article.publishedAt">{{ article.publishedAt }}</time></div><NuxtLink v-if="article.imageSrc" :to="article.href" class="article-list__cover"><img :src="article.imageSrc" :alt="article.imageAlt" loading="lazy"></NuxtLink><h2><NuxtLink :to="article.href">{{ article.title }}</NuxtLink></h2><p>{{ article.excerpt }}</p><NuxtLink :to="article.href">阅读全文 →</NuxtLink></article><p v-if="!articles.length" class="article-list__empty" role="status">此条件下暂无内容，请调整关键词或日期范围。</p></div>
</template>
<style scoped>
.article-list { display:flex; flex-direction:column; gap:18px; }
.article-list__card { padding:26px; background:white; border:1px solid var(--color-border); border-radius:12px; }
.article-list__cover { display:block; margin-bottom:18px; } .article-list__cover img { display:block; width:100%; max-height:240px; object-fit:contain; background:var(--color-bg-light); border-radius:8px; }
.article-list__meta { display:flex; justify-content:space-between; gap:12px; font-size:12px; color:var(--color-text-muted); margin-bottom:12px; }
.article-list__meta span { color:var(--color-primary); }
h2 { font-size:20px; } h2 a { color:var(--color-text); } p { margin:12px 0 16px; color:var(--color-text-muted); line-height:1.8; } .article-list__card > a { font-size:14px; font-weight:600; }
.article-list__empty { background:white; border-radius:12px; padding:32px; text-align:center; }
@media(max-width:639px) { .article-list__card { padding:20px; } h2 { font-size:18px; } }
</style>
