<script setup lang="ts">
import { contentArticles } from '~/data/mock/catalog'
const { today, isRecent } = useContentDate()
function previewArticles(path: string) {
  const all = contentArticles.filter(item => item.sectionPath === path).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt))
  const recent = all.filter(item => isRecent(item.publishedAt))
  return (recent.length ? recent : all).slice(0,3)
}
const columns = computed(() => [
  { id: 'tro', title: 'TRO 案例预警', moreLabel: '更多 TRO 文章', moreHref: '/tro/alerts', articles: previewArticles('/tro/alerts') },
  { id: 'labor', title: '劳动法案例分享', moreLabel: '更多劳动法文章', moreHref: '/domestic/labor-disputes', articles: previewArticles('/domestic/labor-disputes') }
])
</script>

<template>
  <section class="article-preview-section" aria-label="案例分享">
    <PageContainer>
      <SectionHeading
        align="center"
        title="TRO 与劳动法案例分享"
        description="精选大信旧站历史文章，保留原始发布日期；有近三天更新时优先展示。"
      />
      <div class="article-preview-section__columns">
        <div
          v-for="column in columns"
          :key="column.id"
          class="article-preview-section__column"
        >
          <div class="article-preview-section__column-head">
            <h3 class="article-preview-section__column-title">{{ column.title }}</h3>
            <NuxtLink :to="column.moreHref" class="article-preview-section__more">
              {{ column.moreLabel }}
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
          <p v-if="!column.articles.length" role="status">近三天暂无文章，点击更多文章查看历史内容。</p>
          <ul class="article-preview-section__list">
            <li v-for="article in column.articles" :key="article.id">
              <article class="article-preview-card">
                <div class="article-preview-card__meta">
                  <span class="article-preview-card__category">{{ article.category }}</span>
                  <span v-if="article.isFeatured" class="article-preview-card__featured">推荐</span>
                  <time :datetime="article.publishedAt" class="article-preview-card__date">
                    {{ article.publishedAt }}
                  </time>
                </div>
                <h4 class="article-preview-card__title">
                  <NuxtLink :to="article.href">{{ article.title }}</NuxtLink>
                </h4>
                <p class="article-preview-card__excerpt">{{ article.excerpt }}</p>
                <NuxtLink :to="article.href" class="article-preview-card__link">
                  查看详情
                  <span aria-hidden="true">→</span>
                </NuxtLink>
              </article>
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.article-preview-section {
  padding-block: var(--space-16);
  background-color: var(--color-bg-light);
}

.article-preview-section__columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
  margin-top: var(--space-8);
}

.article-preview-section__column-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.article-preview-section__column-title {
  font-size: var(--text-lg);
  color: var(--color-text);
}

.article-preview-section__more {
  font-size: var(--text-sm);
  color: var(--color-primary);
  white-space: nowrap;
}

.article-preview-section__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.article-preview-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.article-preview-card:hover,
.article-preview-card:focus-within {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.article-preview-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  font-size: var(--text-xs);
}

.article-preview-card__category {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.article-preview-card__featured {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: color-mix(in srgb, var(--color-accent) 80%, var(--color-text));
  font-weight: 600;
}

.article-preview-card__date {
  color: var(--color-text-muted);
}

.article-preview-card__title {
  font-size: var(--text-base);
}

.article-preview-card__title a {
  color: var(--color-text);
}

.article-preview-card__title a:hover {
  color: var(--color-primary);
}

.article-preview-card__excerpt {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-preview-card__link {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

@media (max-width: 1023px) {
  .article-preview-section__columns {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
}

@media (max-width: 639px) {
  .article-preview-section {
    padding-block: var(--space-10);
  }
}
</style>
