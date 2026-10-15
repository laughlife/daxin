<script setup lang="ts">
import type { ArticleSummary } from '~/repositories/articles'
defineProps<{ articles: ArticleSummary[] }>()
</script>
<template>
  <div class="article-list">
    <article v-for="article in articles" :key="article.id" class="article-list__card">
      <div class="article-list__meta">
        <span>{{ article.category }}</span>
        <time :datetime="article.publishedAt">{{ article.publishedAt }}</time>
      </div>
      <NuxtLink v-if="article.imageSrc" :to="article.href" class="article-list__cover">
        <img :src="article.imageSrc" :alt="article.imageAlt" loading="lazy">
      </NuxtLink>
      <h2><NuxtLink :to="article.href">{{ article.title }}</NuxtLink></h2>
    </article>
    <p v-if="!articles.length" class="article-list__empty" role="status">
      此条件下暂无内容，请调整关键词或日期范围。
    </p>
  </div>
</template>
<style scoped>
.article-list { display:flex; flex-direction:column; gap:var(--space-5); }
.article-list__card { padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); transition:border-color var(--transition-base),box-shadow var(--transition-base),transform var(--transition-base); }
.article-list__card:hover { border-color:color-mix(in srgb,var(--color-primary) 28%,var(--color-border)); box-shadow:var(--shadow-md); transform:translateY(-2px); }
.article-list__cover { display:block; margin-bottom:var(--space-5); } .article-list__cover img { display:block; width:100%; max-height:280px; border-radius:var(--radius-md); background:var(--color-bg-light); object-fit:contain; }
.article-list__meta { display:flex; justify-content:space-between; gap:var(--space-3); margin-bottom:var(--space-3); color:var(--color-text-muted); font-size:var(--text-xs); }
.article-list__meta span { color:var(--color-primary); }
h2 { font-size:var(--heading-3); } h2 a { color:var(--color-text); }
.article-list__empty { padding:var(--space-8); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); text-align:center; }
@media(max-width:639px) { .article-list__card { padding:var(--space-5); } }
</style>
