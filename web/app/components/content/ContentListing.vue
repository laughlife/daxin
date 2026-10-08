<script setup lang="ts">
import { contentArticles, contentSections } from '~/data/mock/catalog'
import type { ContentSection } from '~/data/mock/catalog'
import { clampPage, inDateRange } from '~/utils/content'
const props = defineProps<{ section: ContentSection }>()
const route = useRoute()
const initialQuery: typeof route.query = import.meta.client && useNuxtApp().payload.prerenderedAt ? {} : route.query
const keyword = ref(typeof initialQuery.q === 'string' ? initialQuery.q : '')
const from = ref(typeof initialQuery.from === 'string' ? initialQuery.from : '')
const to = ref(typeof initialQuery.to === 'string' ? initialQuery.to : '')
const rawPage = ref(Number(initialQuery.page) || 1)
const siblings = computed(() => contentSections.filter(item => item.path.split('/')[1] === props.section.path.split('/')[1]))
const matching = computed(() => contentArticles.filter(item => item.sectionPath === props.section.path && item.keywords.toLowerCase().includes(keyword.value.trim().toLowerCase()) && inDateRange(item.publishedAt, from.value, to.value)).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)))
const pages = computed(() => Math.max(1, Math.ceil(matching.value.length / 6)))
const page = computed(() => clampPage(rawPage.value, pages.value))
const visible = computed(() => matching.value.slice((page.value-1)*6, page.value*6))
watch([keyword, from, to], () => { rawPage.value = 1 }, { flush:'sync' })
function readQuery() {
  keyword.value = typeof route.query.q === 'string' ? route.query.q : ''
  from.value = typeof route.query.from === 'string' ? route.query.from : ''
  to.value = typeof route.query.to === 'string' ? route.query.to : ''
  rawPage.value = Number(route.query.page) || 1
}
onMounted(readQuery)
watch(() => route.query, readQuery)
function reset() { keyword.value = ''; from.value = ''; to.value = ''; rawPage.value = 1 }
</script>
<template>
  <div class="listing-page"><PageContainer><header class="listing-page__head"><p class="listing-page__eyebrow">{{ section.path.startsWith('/tro') ? 'TRO SERVICES' : section.path.startsWith('/domestic') ? 'DOMESTIC SERVICES' : 'KNOWLEDGE CENTER' }}</p><SectionHeading :level="1" :title="section.title" :description="section.description" /></header><ContentColumns :group="section.group"><nav class="listing-tabs" aria-label="栏目导航"><NuxtLink v-for="item in siblings" :key="item.path" :to="item.path" :aria-current="item.path === section.path ? 'page' : undefined">{{ item.title }}</NuxtLink><NuxtLink v-if="section.path.startsWith('/faq')" to="/faq/plaintiff-firms">TRO 原告律所</NuxtLink></nav><form class="listing-search" role="search" @submit.prevent><label>关键词<input v-model="keyword" type="search" placeholder="标题、案件号、品牌名或律所名"></label><label>发布日期从<input v-model="from" type="date" :max="to || undefined"></label><label>发布日期至<input v-model="to" type="date" :min="from || undefined"></label><button type="button" @click="reset">清空</button></form><p v-if="from && to && from > to" class="listing-notice" role="alert">开始日期不能晚于结束日期。</p><p class="listing-notice">共 {{ matching.length }} 篇 · {{ matching.some(item => item.source) ? '旧站历史资料' : '静态演示资料' }}</p><ArticleList :articles="visible" /><CasePagination :page="page" :total-pages="pages" :total="matching.length" noun="篇文章" @update:page="rawPage = $event" /></ContentColumns></PageContainer></div>
</template>
<style scoped>
.listing-page { padding:40px 0 64px; background:var(--color-bg-light); }
.listing-page__head { margin-bottom:28px; } .listing-page__eyebrow { color:var(--color-primary); font-size:12px; font-weight:700; letter-spacing:2px; margin-bottom:12px; }
.listing-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.listing-tabs a { padding:8px 14px; border-radius:8px; background:white; color:var(--color-text); font-size:14px; border:1px solid var(--color-border); }
.listing-tabs a[aria-current=page] { background:var(--color-primary); color:white; border-color:var(--color-primary); }
.listing-search { display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:12px; padding:18px; border-radius:12px; background:white; border:1px solid var(--color-border); }
label { display:flex; flex-direction:column; gap:6px; font-size:12px; min-width:0; } input { width:100%; padding:9px; border:1px solid var(--color-border); border-radius:6px; font:inherit; min-width:0; } button { align-self:end; padding:9px; color:var(--color-primary); } .listing-notice { font-size:13px; color:var(--color-text-muted); margin:16px 0; }
@media(max-width:639px) { .listing-search { grid-template-columns:1fr 1fr; } label:first-child { grid-column:1/-1; } }
</style>
