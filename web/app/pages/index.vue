<script setup lang="ts">
import { ref } from 'vue'
import { homeHero, homeStats, teamIntro } from '~/data/mock/home'
import { siteConfig } from '~/config/site'

/**
 * 官网首页第一版（Task 3）。
 * 内容来自需求文档初稿与本地 Mock 数据（web/app/data/mock/），
 * 未连接任何后端；正式素材（Logo、图片、合作伙伴）待提供。
 */
const contactModalOpen = ref(false)

function openContactModal() {
  contactModalOpen.value = true
}

function closeContactModal() {
  contactModalOpen.value = false
}

useSeoMeta({
  title: '跨境有我，法律无忧',
  description:
    '大信法务团队成立于 2019 年，为跨境电商企业、品牌卖家及供应链伙伴提供 TRO 知识产权、CPSC 召回、劳动合规、合同风控等全链路、跨法域法律服务。当前版本部分内容使用 Mock 演示数据。',
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
        <StatsSection class="home-about__stats" :stats="homeStats" />
      </PageContainer>
    </section>

    <BusinessSection />
    <CasePreviewSection />
    <ArticlePreviewSection />
    <PartnerStrip />

    <ConsultationCta @open-contact="openContactModal" />

    <WechatQrModal :open="contactModalOpen" @close="closeContactModal" />
  </div>
</template>

<style scoped>
.home-about {
  padding-block: var(--space-16);
  background-color: var(--color-bg-page);
}

.home-about__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  max-width: 860px;
  margin-inline: auto;
  margin-top: var(--space-6);
  text-align: center;
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
