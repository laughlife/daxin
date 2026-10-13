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
          <p class="article-detail__lead">{{ article.excerpt }}</p>
          <img
            v-if="article.imageSrc"
            class="article-detail__cover"
            :src="article.imageSrc"
            :alt="article.imageAlt"
            loading="lazy"
          >
          <RichArticleBody v-if="html" :html="html" />
          <p v-else class="article-detail__empty" role="status">该文章暂无正文内容。</p>
          <div class="article-detail__back">
            <NuxtLink :to="section.path">← 返回{{ section.title }}</NuxtLink>
            <NuxtLink to="/infringement-check">产品侵权检测 →</NuxtLink>
          </div>
        </article>
        <section class="article-detail__related">
          <h2>相关阅读</h2>
          <ArticleList :articles="related" :hide-excerpt="section.group === 'tro'" />
        </section>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.article-detail { padding:32px 0 64px; background:var(--color-bg-light); } .article-detail__crumb { font-size:13px; margin-bottom:24px; color:var(--color-text-muted); }
.article-detail__body { padding:36px; background:white; border:1px solid var(--color-border); border-radius:12px; } .article-detail__meta { color:var(--color-text-muted); font-size:13px; margin-bottom:16px; } h1 { font-size:30px; line-height:1.5; } .article-detail__lead { padding:18px; border-left:3px solid var(--color-primary); background:var(--color-bg-light); margin-top:24px; } .article-detail__cover { display:block; width:100%; max-height:420px; object-fit:contain; margin-top:20px; border-radius:8px; background:var(--color-bg-light); } .article-detail__empty { margin-top:24px; color:var(--color-text-muted); } .article-detail__back { margin-top:32px; display:flex; gap:18px; flex-wrap:wrap; font-size:14px; }
@media(max-width:639px) { .article-detail__body { padding:22px; } h1 { font-size:24px; } }
</style>
