<script setup lang="ts">
import type { HomeArticleColumn } from '~/repositories/home'

/**
 * 首页「案例分享」区域。
 *
 * 需求：案例模块分四类、每类只展示近三篇。
 * 栏目数据由接口按分类各取近 3 篇后传入（保证是「每类最近三篇」，
 * 而不是「最近 6 篇里恰好属于该类的」）；空分类显示空状态。
 */
const props = defineProps<{
  columns: HomeArticleColumn[]
}>()

/** 各分类的展示标题与「更多」入口。 */
const CATEGORY_META: Record<string, { title: string, moreLabel: string, moreHref: string }> = {
  'tro-alert': { title: 'TRO 案件预警', moreLabel: '更多 TRO 预警', moreHref: '/tro/alerts' },
  'tro-success': { title: 'TRO 成功案例', moreLabel: '更多成功案例', moreHref: '/tro/success-cases' },
  'labor-case': { title: '劳动法案例', moreLabel: '更多劳动法文章', moreHref: '/domestic/labor-disputes' },
  'freight-case': { title: '货代案例', moreLabel: '更多货代案例', moreHref: '/domestic/freight-cases' },
}

/** 合并接口栏目与展示元数据；未知分类按 slug 原样展示，不隐藏数据。 */
const items = computed(() =>
  props.columns.map((column) => {
    const meta = CATEGORY_META[column.slug]
    return {
      slug: column.slug,
      title: meta?.title ?? column.slug,
      moreLabel: meta?.moreLabel ?? '更多文章',
      moreHref: meta?.moreHref ?? '/tro/alerts',
      // 接口已按分类限流；这里再兜一层，确保「每类最多三篇」
      articles: column.articles.slice(0, 3)
    }
  })
)
</script>

<template>
  <section class="article-preview-section" aria-label="案例分享">
    <PageContainer>
      <SectionHeading
        align="center"
        title="案例分享"
        description="按 TRO 预警、TRO 成功案例、劳动法案例与货代案例四类展示，每类保留最近三篇。"
      />
      <div class="article-preview-section__columns">
        <div
          v-for="item in items"
          :key="item.slug"
          class="article-preview-section__column"
        >
          <div class="article-preview-section__column-head">
            <h3 class="article-preview-section__column-title">{{ item.title }}</h3>
            <NuxtLink :to="item.moreHref" class="article-preview-section__more">
              {{ item.moreLabel }}
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
          <ul v-if="item.articles.length > 0" class="article-preview-section__list">
            <li v-for="article in item.articles" :key="article.id">
              <article class="article-preview-card">
                <!-- 需求：每个案例在最左侧配一张图；没有配图时不渲染图片位 -->
                <NuxtLink v-if="article.imageSrc" :to="article.href" class="article-preview-card__thumb">
                  <img :src="article.imageSrc" :alt="article.imageAlt || article.title" loading="lazy">
                </NuxtLink>
                <div class="article-preview-card__body">
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
                </div>
              </article>
            </li>
          </ul>
          <p v-else class="article-preview-section__empty" role="status">
            该分类暂无已发布文章。
          </p>
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

/* 四个栏目上下排列（需求：不用左右两列） */
.article-preview-section__columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-10);
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

.article-preview-section__empty {
  padding: var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.article-preview-section__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.article-preview-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: var(--space-5);
  padding: var(--space-5);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

/* 每篇最左侧的配图 */
.article-preview-card__thumb {
  display: block;
  flex: 0 0 220px;
  width: 220px;
  align-self: stretch;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.article-preview-card__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 130px;
  object-fit: cover;
}

.article-preview-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1 1 auto;
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
    gap: var(--space-8);
  }
}

@media (max-width: 639px) {
  .article-preview-section {
    padding-block: var(--space-10);
  }

  /* 窄屏：配图缩到左侧小图，避免挤压文字 */
  .article-preview-card {
    gap: var(--space-3);
  }

  .article-preview-card__thumb {
    flex: 0 0 110px;
    width: 110px;
  }

  .article-preview-card__thumb img {
    min-height: 90px;
  }
}
</style>
