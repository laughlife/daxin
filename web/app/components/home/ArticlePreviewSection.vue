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
  'tro-alert': { title: 'TRO 侵权预警', moreLabel: '更多 TRO 预警', moreHref: '/tro/alerts' },
  'tro-success': { title: 'TRO 成功案例', moreLabel: '更多成功案例', moreHref: '/tro/success-cases' },
  'labor-case': { title: '劳动纠纷', moreLabel: '更多劳动纠纷', moreHref: '/domestic/labor-disputes' },
  'freight-case': { title: '货代案例', moreLabel: '更多货代案例', moreHref: '/domestic/freight-cases' },
}

/** 合并接口栏目与展示元数据；未知分类按 slug 原样展示，不隐藏数据。 */
const items = computed(() =>
  props.columns.map((column) => {
    const meta = CATEGORY_META[column.slug]
    return {
      slug: column.slug,
      title: meta?.title ?? column.slug,
      section: column.section,
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
      <div class="article-preview-section__heading">
        <div class="article-preview-section__heading-row">
          <span class="article-preview-section__heading-rule" aria-hidden="true" />
          <h2 class="article-preview-section__heading-title">案例分享</h2>
          <span class="article-preview-section__heading-rule" aria-hidden="true" />
        </div>
        <p class="article-preview-section__heading-english">CASE SHARING</p>
      </div>
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
  padding-block: var(--space-section);
  background-color: var(--color-bg-page);
}

.article-preview-section__heading {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  text-align: center;
}

.article-preview-section__heading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(var(--space-4), 3vw, var(--space-8));
  width: 100%;
}

.article-preview-section__heading-title {
  flex: none;
  color: #2b2927;
  font-size: clamp(36px, 3.2vw, 64px);
  font-weight: 700;
  line-height: 1.2;
}

.article-preview-section__heading-rule {
  width: clamp(40px, 6.2vw, 128px);
  height: 1px;
  background-color: #2b2927;
}

.article-preview-section__heading-english {
  color: #e6e6e6;
  font-size: clamp(20px, 1.8vw, 36px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

/* 四个栏目上下排列（需求：不用左右两列） */
.article-preview-section__columns {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-10);
  margin-top: var(--space-8);
}

.article-preview-section__column,
.article-preview-section__list {
  min-width: 0;
}

.article-preview-section__column-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.article-preview-section__column-title {
  margin: 0;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.article-preview-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-4);
  
  padding: var(--space-4);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

/* 封面保持接近原始 150px 方图尺寸，避免在卡片内横向放大后发糊。 */
.article-preview-card__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 900 / 382;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-bg-light);
}

.article-preview-card__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.article-preview-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1 1 auto;
  justify-content: center;
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
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.4;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.article-preview-card__title a {
  color: var(--color-text);
}

.article-preview-card__title a:hover {
  color: var(--color-primary);
}

@media (max-width: 1023px) {
  .article-preview-section__columns {
    gap: var(--space-8);
  }
}

@media (max-width: 639px) {
  .article-preview-section {
    padding-block: var(--space-section);
  }

  /* 窄屏仍保持横向卡片轨道，单卡尺寸固定并支持触控滑动。 */
  .article-preview-section__list {
    display: flex;
    width: 100%;
    overflow-x: auto;
    padding: 0 0 var(--space-2);
    scroll-snap-type: x mandatory;
    overscroll-behavior-inline: contain;
  }

  .article-preview-section__list > li {
    flex: 0 0 280px;
    scroll-snap-align: start;
  }

  .article-preview-card {
    height: 136px;
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .article-preview-card__thumb {
  display: block;
  width: 100%;
  aspect-ratio: 900 / 382;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-bg-light);
}
}
</style>
