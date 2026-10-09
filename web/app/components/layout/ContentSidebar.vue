<script setup lang="ts">
import { fetchArticles } from '~/repositories/articles'
import { siteConfig } from '~/config/site'

/**
 * 内容页侧栏：联系方式 + 推荐阅读 + 常见问题。
 * 推荐阅读来自公开文章接口（fetchArticles），按栏目分组过滤；失败时给出中性提示。
 */
const props = withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all' }>(), { group: 'all' })

const { data, error } = useAsyncData(
  'sidebar-reading',
  () => fetchArticles({ pageSize: 12 })
)

const articles = computed(() => {
  const items = data.value?.items ?? []
  const matched = props.group === 'all'
    ? items
    : items.filter(item => props.group === 'tro'
      ? item.href.startsWith('/tro/')
      : item.href.startsWith('/domestic/'))
  return matched.slice(0, 4)
})
const hasTroArticles = computed(() => articles.value.some(item => item.href.startsWith('/tro/')))
</script>

<template>
  <aside class="content-sidebar" aria-label="联系与相关阅读">
    <section class="sidebar-card"><h2>{{ group === 'tro' ? 'TRO 专属联系' : group === 'labor' ? '国内业务与劳动法联系' : '关注与咨询' }}</h2><p class="sidebar-card__intro">关注公众号了解资讯，添加咨询号沟通案件。</p><ContactQrGrid :group="group" /><a class="sidebar-card__phone" :href="`tel:${siteConfig.contact.phone}`">电话咨询：{{ siteConfig.contact.phone }}</a></section>
    <section class="sidebar-card"><div class="sidebar-card__heading"><h2>推荐阅读</h2><NuxtLink v-if="hasTroArticles" to="/tro/alerts" class="sidebar-card__more">更多文章</NuxtLink></div><p v-if="error" class="sidebar-card__intro" role="status">推荐阅读加载失败，请稍后刷新。</p><ul v-else class="sidebar-card__links"><li v-for="article in articles" :key="article.id"><NuxtLink :to="article.href">{{ article.title }}</NuxtLink></li></ul></section>
    <section class="sidebar-card"><h2>常见问题</h2><ul class="sidebar-card__links"><li v-if="group !== 'labor'"><NuxtLink to="/faq/tro">TRO 常见问题</NuxtLink></li><li v-if="group !== 'tro'"><NuxtLink to="/faq/labor">劳动争议</NuxtLink></li><li><NuxtLink to="/faq/cross-border">跨境干货</NuxtLink></li></ul></section>
  </aside>
</template>
<style scoped>
.content-sidebar { display:flex; flex-direction:column; gap:20px; }
.sidebar-card { background:white; border:1px solid var(--color-border); border-radius:12px; padding:20px; box-shadow:var(--shadow-sm); }
.sidebar-card h2 { font-size:18px; margin-bottom:16px; }
.sidebar-card__heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.sidebar-card__heading h2 { margin-bottom:0; }
.sidebar-card__more { color:var(--color-primary); font-size:13px; white-space:nowrap; }
.sidebar-card__more:hover { text-decoration:underline; }
.sidebar-card__intro { font-size:13px; color:var(--color-text-muted); margin-bottom:16px; }
.sidebar-card__phone { display:block; margin-top:20px; padding-top:16px; border-top:1px solid var(--color-border); font-weight:600; font-size:14px; }
.sidebar-card__links { display:flex; flex-direction:column; gap:12px; font-size:14px; }
.sidebar-card__links li + li { border-top:1px solid var(--color-border); padding-top:12px; }
.sidebar-card__links a { color:var(--color-text); }
@media(min-width:640px) and (max-width:1023px) { .content-sidebar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
