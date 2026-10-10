<script setup lang="ts">
import { ref } from 'vue'
import { homeHero, homeStats, teamIntro } from '~/config/homeContent'
import { fetchHomeData } from '~/repositories/home'
import { siteConfig } from '~/config/site'

/**
 * 官网首页第一版（Task 3）。
 * 首页文案来自 `~/config/homeContent`；成功案例与推荐阅读来自仓储 fetchHomeData()。
 */
const contactModalOpen = ref(false)
const contactGroup = ref<'tro' | 'labor'>('tro')

const { data: homeData, error: homeError, refresh: refreshHome } = await useAsyncData(
  'home-data',
  () => fetchHomeData()
)

/**
 * 团队介绍右侧配图：来自后台站点配置的 home_right_image（经 media_assets 关联）。
 * 未配置时不渲染图片位，避免出现空白框或假图。
 */
const { data: siteSettings } = await useSiteSettings()
const homeRightImage = computed(() => {
  const value = siteSettings.value?.settings?.home_right_image
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

const featuredCases = computed(() => homeData.value?.featuredCases ?? [])
const recentArticles = computed(() => homeData.value?.recentArticles ?? [])
const homeErrorMessage = computed(() =>
  homeError.value instanceof Error && homeError.value.message
    ? homeError.value.message
    : '首页数据加载失败，请稍后重试'
)

function openContactModal(group: 'tro' | 'labor' = 'tro') {
  contactGroup.value = group
  contactModalOpen.value = true
}

function closeContactModal() {
  contactModalOpen.value = false
}

useSeoMeta({
  title: '跨境有我，法律无忧',
  description:
    '大信法务团队成立于 2019 年，为跨境电商企业、品牌卖家及供应链伙伴提供 TRO 知识产权、CPSC 召回、劳动合规、合同风控等全链路、跨法域法律服务。',
  ogTitle: '大信法务 - 跨境有我，法律无忧',
  ogDescription:
    '专注于为跨境电商企业、品牌卖家及供应链伙伴提供全链路、跨法域、高实效的法律顾问服务。'
})

// 基础 JSON-LD：仅使用需求文档已给出的信息（成立时间、业务范围、联系方式），
// 不虚构律师执业资质、注册资本等未确认信息；正式域名确认后再补 url 字段。
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LegalService',
        name: siteConfig.name,
        description: homeHero.subtitle,
        foundingDate: '2019',
        areaServed: ['US', 'CN'],
        knowsAbout: [
          'TRO 知识产权',
          'CPSC 产品召回',
          '美国加州 65 号法案',
          '用工劳动合规',
          '合同风控',
          '海关合规',
          '跨境物流法律事务'
        ],
        contactPoint: [
          {
            '@type': 'ContactPoint',
            telephone: siteConfig.contact.phone,
            email: siteConfig.contact.email,
            contactType: 'customer service',
            availableLanguage: ['zh-CN']
          }
        ],
        address: {
          '@type': 'PostalAddress',
          streetAddress: siteConfig.contact.address,
          addressLocality: '深圳市',
          addressCountry: 'CN'
        }
      })
    }
  ]
})
</script>

<template>
  <div>
    <HomeHero @open-contact="openContactModal" />

    <section class="home-about" aria-label="团队介绍">
      <PageContainer>
        <SectionHeading align="center" :title="teamIntro.title" />
        <!-- 需求：左字右图。图片位在公司名右侧，图片来自后台配置 home_right_image -->
        <div class="home-about__layout">
          <div class="home-about__content">
            <p
              v-for="(paragraph, index) in teamIntro.paragraphs"
              :key="index"
              class="home-about__paragraph"
            >
              {{ paragraph }}
            </p>
            <NuxtLink :to="teamIntro.moreLink.to" class="home-about__more">
              {{ teamIntro.moreLink.label }}
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
          <figure v-if="homeRightImage" class="home-about__figure">
            <img
              class="home-about__image"
              :src="homeRightImage"
              :alt="teamIntro.title"
              loading="lazy"
            >
          </figure>
        </div>
        <StatsSection class="home-about__stats" :stats="homeStats" />
      </PageContainer>
    </section>

    <BusinessSection />
    <section class="home-content"><PageContainer><ContentColumns>
      <ErrorState
        v-if="homeError"
        title="首页数据加载失败"
        :message="homeErrorMessage"
        @retry="refreshHome"
      />
      <template v-else>
        <CasePreviewSection :cases="featuredCases" />
        <ArticlePreviewSection :articles="recentArticles" />
      </template>
    </ContentColumns></PageContainer></section>

    <WechatQrModal :group="contactGroup" :open="contactModalOpen" @close="closeContactModal" />
  </div>
</template>

<style scoped>
.home-about {
  padding-block: var(--space-16);
  background-color: var(--color-bg-page);
}

/* 左字右图：文字居左、配图居右；窄屏改为上下排列（文字在上、图片在下） */
.home-about__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-10);
  margin-top: var(--space-6);
}

.home-about__figure {
  margin: 0;
}

.home-about__image {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.home-about__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  text-align: left;
}

@media (max-width: 767px) {
  .home-about__layout {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
}

.home-about__paragraph {
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.home-about__paragraph:first-child {
  font-size: var(--text-lg);
  color: var(--color-text);
  font-weight: 600;
}

.home-about__more {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.home-about__more:hover {
  color: var(--color-primary-dark);
}

.home-about__stats {
  margin-top: var(--space-10);
}

@media (max-width: 639px) {
  .home-about {
    padding-block: var(--space-10);
  }
}
</style>

<style scoped>
.home-content { padding-block:48px; background:var(--color-bg-light); }
.home-content :deep(.case-preview-section), .home-content :deep(.article-preview-section) { padding:0 0 28px; background:transparent; }
.home-content :deep(.case-preview-section > .page-container), .home-content :deep(.article-preview-section > .page-container) { padding:0; }
.home-content :deep(.case-preview-section__grid) { grid-template-columns:1fr; }
</style>
