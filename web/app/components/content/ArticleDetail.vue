<script setup lang="ts">
import { mockCases } from '~/data/mock/cases'
import type { ContentArticle } from '~/data/mock/catalog'
import { contentArticles, contentSections } from '~/data/mock/catalog'
const props = defineProps<{ article: ContentArticle }>()
const section = computed(() => contentSections.find(item => item.path === props.article.sectionPath)!)
const relatedCases = computed(() => mockCases.filter(item => props.article.relatedCaseSlugs.includes(item.slug)))
const related = computed(() => contentArticles.filter(item => item.sectionPath === props.article.sectionPath && item.id !== props.article.id).slice(0,3))
</script>
<template><div class="article-detail"><PageContainer><nav class="article-detail__crumb" aria-label="面包屑"><NuxtLink to="/">首页</NuxtLink> / <NuxtLink :to="section.path">{{ section.title }}</NuxtLink> / 正文</nav><ContentColumns :group="section.group"><article class="article-detail__body"><p class="article-detail__meta">{{ article.category }} · <time :datetime="article.publishedAt">{{ article.publishedAt }}</time> · 大信法务</p><h1>{{ article.title }}</h1><p class="article-detail__lead">{{ article.excerpt }}</p><section v-for="part in article.body" :key="part.title"><h2>{{ part.title }}</h2><p>{{ part.text }}</p></section><section v-if="relatedCases.length"><h2>关联演示案件</h2><p v-for="record in relatedCases" :key="record.slug"><NuxtLink :to="`/tro/cases/${record.slug}`">{{ record.caseNumber }} · {{ record.plaintiffBrand }} · {{ record.lawFirm }}</NuxtLink></p></section><div class="article-detail__back"><NuxtLink :to="section.path">← 返回{{ section.title }}</NuxtLink><NuxtLink to="/infringement-check">产品侵权检测 →</NuxtLink></div></article><section class="article-detail__related"><h2>相关阅读</h2><ArticleList :articles="related" /></section></ContentColumns></PageContainer></div></template>
<style scoped>
.article-detail { padding:32px 0 64px; background:var(--color-bg-light); } .article-detail__crumb { font-size:13px; margin-bottom:24px; color:var(--color-text-muted); }
.article-detail__body { padding:36px; background:white; border:1px solid var(--color-border); border-radius:12px; } .article-detail__meta { color:var(--color-text-muted); font-size:13px; margin-bottom:16px; } h1 { font-size:30px; line-height:1.5; } .article-detail__lead { padding:18px; border-left:3px solid var(--color-primary); background:var(--color-bg-light); margin-top:24px; } section { margin-top:28px; } h2 { font-size:20px; margin-bottom:12px; } section p { line-height:1.95; color:var(--color-text-muted); } .article-detail__back { margin-top:32px; display:flex; gap:18px; flex-wrap:wrap; font-size:14px; }
@media(max-width:639px) { .article-detail__body { padding:22px; } h1 { font-size:24px; } }
</style>
