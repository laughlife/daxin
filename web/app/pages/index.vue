<script setup lang="ts">
import { ref } from 'vue'
import { homeStats, teamIntro } from '~/config/homeContent'
import { fetchHomeData } from '~/repositories/home'
import { qrSourcesFromAssets } from '~/utils/contactQr'

/**
 * 官网首页第一版（Task 3）。
 * 首页文案来自站点配置；案例分享、团队业务和核心优势来自仓储 fetchHomeData()。
 */
const contactModalOpen = ref(false)
const contactGroup = ref<'tro' | 'labor'>('tro')

const { data: homeData, error: homeError, refresh: refreshHome } = await useAsyncData(
  'home-data',
  () => fetchHomeData()
)

const { data: siteSettings } = await useSiteSettings()
const qrSources = computed(() => qrSourcesFromAssets(siteSettings.value?.footer.qr))
/**
 * 站点身份与联系方式：后台「站点信息」优先，为空回退 config。
 * 结构化数据（schema.org）里的名称与联系方式也走这里，保证与页脚一致。
 */
const identity = useSiteIdentity()

/**
 * 首页 Banner 图片，由后台「图片管理」维护。
 * 未配置时返回空串，模板据此不渲染该区块。
 */
const homeBannerImage = computed(() => {
  const value = siteSettings.value?.settings?.home_banner_image
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

/**
 * 首页首屏文案：优先取后台「站点设置 → 首页文案」，留空时回退到
 * config/homeContent 的静态文案。
 *
 * 原先这里直接用 config，导致后台首页文案分页签改了没有效果；
 * 现在把可编辑字段接到页面上，后台改动才会真正生效。
 * `readSettingText` 只接受字符串并按空格判断空值，避免把 undefined/数字塞进模板。
 */
function readSettingText(key: string): string {
  const value = siteSettings.value?.settings?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const heroFromSettings = computed(() => ({
  badge: readSettingText('home_hero_badge'),
  title: readSettingText('home_hero_title'),
  subtitle: readSettingText('home_hero_subtitle'),
  primaryLabel: readSettingText('home_hero_primary_label'),
  primaryLink: readSettingText('home_hero_primary_link'),
  secondaryLabel: readSettingText('home_hero_secondary_label'),
}))

/** 数据概览：配置里是 JSON 数组，非数组时回退静态配置。 */
const statsFromSettings = computed(() => {
  const value = siteSettings.value?.settings?.home_stats
  if (!Array.isArray(value) || value.length === 0) return homeStats
  const items = value
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>
      return {
        value: String(record.value ?? ''),
        label: String(record.label ?? ''),
        description: String(record.description ?? ''),
        emphasis: record.emphasis === true,
      }
    })
    .filter((item) => item.value || item.label)
  return items.length > 0 ? items : homeStats
})

const teamTitleFromSettings = computed(() => readSettingText('about_team_title') || teamIntro.title)
const teamDisplayTitle = computed(() => teamTitleFromSettings.value.replace(/^About\s*US\s*[·|｜—-]?\s*/i, '') || '大信法务团队')
const teamParagraphsFromSettings = computed(() => {
  const value = siteSettings.value?.settings?.about_team_paragraphs
  if (!Array.isArray(value)) return teamIntro.paragraphs
  const paragraphs = value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map(entry => entry.trim())
  return paragraphs.length ? paragraphs : teamIntro.paragraphs
})

const articleColumns = computed(() => homeData.value?.articleColumns ?? [])
const teamServices = computed(() => homeData.value?.teamServices ?? [])
const coreAdvantages = computed(() => homeData.value?.coreAdvantages ?? [])
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
        name: identity.value.name,
        description: identity.value.description,
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
            telephone: identity.value.phone,
            email: identity.value.email,
            contactType: 'customer service',
            availableLanguage: ['zh-CN']
          }
        ],
        address: {
          '@type': 'PostalAddress',
          streetAddress: identity.value.address,
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
    <HomeHero
      v-bind="heroFromSettings"
      @open-contact="openContactModal"
    />

    <!--
      首页 Banner：由后台「图片管理」维护（site_settings.home_banner_image）。
      未配置时不渲染该区块，避免出现空白框或占位图。
    -->
    <section v-if="homeBannerImage" class="home-banner" aria-label="首页横幅">
      <PageContainer>
        <img
          class="home-banner__img"
          :src="homeBannerImage"
          alt="大信法务"
          loading="eager"
        >
      </PageContainer>
    </section>

    <section class="home-about" aria-label="团队介绍">
      <PageContainer>
        <div class="home-about__layout">
          <div class="home-about__content">
            <SectionHeading align="center" eyebrow="About US" :title="teamDisplayTitle" />
            <p
              v-for="(paragraph, index) in teamParagraphsFromSettings"
              :key="index"
              class="home-about__paragraph"
            >
              {{ paragraph }}
            </p>
            <NuxtLink to="/about" class="home-about__more">
              了解更多
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
          <HomeTeamServices :sections="teamServices" />
        </div>
        <StatsSection class="home-about__stats" :stats="statsFromSettings" />
      </PageContainer>
    </section>

    <HomeCoreAdvantages :items="coreAdvantages" />
    <HomeLegalGuides />
    <section class="home-content"><PageContainer>
      <ErrorState
        v-if="homeError"
        title="首页数据加载失败"
        :message="homeErrorMessage"
        @retry="refreshHome"
      />
      <template v-else>
        <ArticlePreviewSection :columns="articleColumns" />
      </template>
    </PageContainer></section>

    <WechatQrModal :group="contactGroup" :open="contactModalOpen" :sources="qrSources" @close="closeContactModal" />
  </div>
</template>

<style scoped>
.home-about {
  padding-block: var(--space-16);
  background-color: var(--color-bg-page);
}

.home-about__layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: stretch;
  gap: var(--space-8);
  margin-inline: auto;
  margin-top: var(--space-6);
}

.home-about__content {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-4);
  text-align: left;
}

.home-about__content :deep(.section-heading) {
  align-self: stretch;
  gap: var(--space-2);
}

.home-about__content :deep(.section-heading__eyebrow) {
  font-size: var(--text-sm);
}

.home-about__content :deep(.section-heading__eyebrow::before),
.home-about__content :deep(.section-heading__eyebrow::after) {
  width: 32px;
}

@media (max-width: 767px) {
  .home-about__layout {
    grid-template-columns: 1fr;
    gap: var(--space-6);
    margin-top: var(--space-4);
  }
}

.home-about__paragraph {
  color: var(--color-text-muted);
  line-height: 1.55;
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

/* 首页 Banner：整幅图片，宽度撑满容器并保持原始比例 */
.home-banner { padding-block:32px; }
.home-banner__img { display:block; width:100%; height:auto; border-radius:var(--radius-lg); }
@media (max-width: 767px) {
  .home-banner { padding-block:20px; }
  .home-banner__img { border-radius:var(--radius-md); }
}
</style>
