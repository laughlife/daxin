<script setup lang="ts">
import { fetchArticles } from '~/repositories/articles'
import type { ArticleSummary } from '~/repositories/articles'
import type { ContentSection } from '~/config/contentSections'

/**
 * 文章详情。
 *
 * 文章数据与清洗后的正文 HTML 由 `~/repositories/articles` 的 fetchArticleDetail() 提供；
 * 相关阅读取同类别的其他文章（失败时静默省略，不影响正文展示）。
 */
const props = defineProps<{
  article: ArticleSummary
  html: string
  section: ContentSection
}>()

const { data: relatedData } = useAsyncData(
  () => `article-related:${props.section.category}:${props.article.id}`,
  async () => {
    if (!props.section.category) return null
    try {
      return await fetchArticles({ category: props.section.category, pageSize: 4 })
    } catch {
      return null
    }
  }
)

const related = computed(() =>
  (relatedData.value?.items ?? []).filter(item => item.id !== props.article.id).slice(0, 3)
)
</script>

<template>
  <div class="article-detail">
    <PageContainer>
      <nav class="article-detail__crumb" aria-label="面包屑">
        <NuxtLink to="/">首页</NuxtLink> / <NuxtLink :to="section.path">{{ section.title }}</NuxtLink> / 正文
      </nav>
      <ContentColumns :group="section.group">
        <article class="article-detail__body">
          <p class="article-detail__meta">
            {{ article.category }} · <time :datetime="article.publishedAt">{{ article.publishedAt }}</time> · 大信法务
          </p>
          <h1>{{ article.title }}</h1>
          <RichArticleBody v-if="html" :html="html" />
          <p v-else class="article-detail__empty" role="status">该文章暂无正文内容。</p>
          <div class="article-detail__back">
            <NuxtLink :to="section.path">← 返回{{ section.title }}</NuxtLink>
            <NuxtLink to="/infringement-check">产品侵权检测 →</NuxtLink>
          </div>
        </article>
        <section class="article-detail__related">
          <h2>相关阅读</h2>
          <ArticleList :articles="related" />
        </section>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.article-detail { padding-block:var(--space-section-compact) var(--space-section); background:var(--color-bg-light); }
.article-detail__crumb { margin-bottom:var(--space-6); color:var(--color-text-muted); font-size:var(--text-sm); }
.article-detail__body { padding:var(--space-8); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.article-detail__meta { margin-bottom:var(--space-4); color:var(--color-text-muted); font-size:var(--text-sm); }
h1 { font-size:var(--heading-1); line-height:var(--leading-tight); }
.article-detail__empty { margin-top:var(--space-6); color:var(--color-text-muted); }
.article-detail__back { display:flex; flex-wrap:wrap; gap:var(--space-4); margin-top:var(--space-8); font-size:var(--text-sm); }
@media(max-width:639px) { .article-detail__body { padding:var(--space-5); } }
</style>
