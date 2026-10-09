<script setup lang="ts">
import { findContentSection, findContentSectionByHref } from '~/config/contentSections'
import { fetchArticleDetail } from '~/repositories/articles'

/**
 * 内容页兜底路由。
 * - 命中配置里的栏目路径 → 栏目列表（ContentListing，文章来自 fetchArticles）；
 * - 其余路径按文章 slug 处理 → fetchArticleDetail，正文渲染接口清洗后的 html；
 * - 接口明确未命中才 404，请求失败展示错误状态，不回退任何演示数据。
 */
const route = useRoute()
const path = route.path.replace(/\/$/, '')
const section = findContentSection(path)

const { data, error, refresh } = await useAsyncData(
  () => `content-page:${path}`,
  async () => {
    if (section) return null
    const slug = path.split('/').filter(Boolean).pop() ?? ''
    if (!slug) return null
    return await fetchArticleDetail(slug)
  },
  { watch: [() => route.path] }
)

if (!section && !data.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: '内容不存在', fatal: true })
}

const article = computed(() => data.value?.article ?? null)
const html = computed(() => data.value?.html ?? '')
const articleSection = computed(() => {
  const current = article.value
  if (!current) return null
  return findContentSectionByHref(current.href) ?? {
    path: '/tro/news',
    title: '热点资讯',
    group: 'tro' as const,
    description: '',
    category: 'news'
  }
})
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '文章加载失败，请稍后重试'
)

useSeoMeta({
  title: () => article.value?.title ?? section?.title,
  description: () => article.value?.excerpt ?? section?.description
})
</script>

<template>
  <ContentListing v-if="section" :key="section.path" :section="section" />
  <div v-else class="content-fallback">
    <PageContainer>
      <ErrorState
        v-if="error"
        title="文章加载失败"
        :message="errorMessage"
        @retry="refresh"
      />
      <ArticleDetail
        v-else-if="article && articleSection"
        :key="path"
        :article="article"
        :html="html"
        :section="articleSection"
      />
    </PageContainer>
  </div>
</template>

<style scoped>
.content-fallback { padding:32px 0 64px; background:var(--color-bg-light); min-height:50vh; }
</style>
