<script setup lang="ts">
import { contentArticles } from '~/data/mock/catalog'
import { siteConfig } from '~/config/site'
const props = withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all' }>(), { group: 'all' })
const articles = computed(() => contentArticles.filter(item => props.group === 'all' || (props.group === 'tro' ? item.sectionPath.startsWith('/tro') : item.sectionPath.startsWith('/domestic') || item.sectionPath === '/faq/labor')).slice(-4).reverse())
</script>
<template>
  <aside class="content-sidebar" aria-label="联系与相关阅读">
    <section class="sidebar-card"><h2>{{ group === 'tro' ? 'TRO 专属联系' : group === 'labor' ? '国内业务与劳动法联系' : '关注与咨询' }}</h2><p class="sidebar-card__intro">关注公众号了解资讯，添加咨询号沟通案件。</p><ContactQrGrid :group="group" /><a class="sidebar-card__phone" :href="`tel:${siteConfig.contact.phone}`">电话咨询：{{ siteConfig.contact.phone }}</a></section>
    <section class="sidebar-card"><h2>推荐阅读</h2><ul class="sidebar-card__links"><li v-for="article in articles" :key="article.id"><NuxtLink :to="article.href">{{ article.title }}</NuxtLink></li></ul></section>
    <section class="sidebar-card"><h2>常见问题</h2><ul class="sidebar-card__links"><li v-if="group !== 'labor'"><NuxtLink to="/faq/tro">TRO 常见问题</NuxtLink></li><li v-if="group !== 'tro'"><NuxtLink to="/faq/labor">劳动争议</NuxtLink></li><li><NuxtLink to="/faq/cross-border">跨境干货</NuxtLink></li></ul></section>
  </aside>
</template>
<style scoped>
.content-sidebar { display:flex; flex-direction:column; gap:20px; }
.sidebar-card { background:white; border:1px solid var(--color-border); border-radius:12px; padding:20px; box-shadow:var(--shadow-sm); }
.sidebar-card h2 { font-size:18px; margin-bottom:16px; }
.sidebar-card__intro { font-size:13px; color:var(--color-text-muted); margin-bottom:16px; }
.sidebar-card__phone { display:block; margin-top:20px; padding-top:16px; border-top:1px solid var(--color-border); font-weight:600; font-size:14px; }
.sidebar-card__links { display:flex; flex-direction:column; gap:12px; font-size:14px; }
.sidebar-card__links li + li { border-top:1px solid var(--color-border); padding-top:12px; }
.sidebar-card__links a { color:var(--color-text); }
@media(min-width:640px) and (max-width:1023px) { .content-sidebar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
