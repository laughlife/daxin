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

/** 首页团队介绍背景图由后台站点配置维护。 */
function readSettingText(key: string): string {
  const value = siteSettings.value?.settings?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/** 团队介绍的图片铺设为整块背景，文字叠加其上。 */
const teamBackgroundImage = computed(() => readSettingText('home_team_background'))
const teamBackgroundStyle = computed(() => ({
  backgroundImage: teamBackgroundImage.value
    ? `url(${JSON.stringify(teamBackgroundImage.value)})`
    : undefined,
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

const teamTitleFromSettings = computed(() => readSettingText('home_team_title') || teamIntro.title)
const teamDisplayTitle = computed(() => teamTitleFromSettings.value || '大信法务团队')
/**
 * 团队介绍下方四项亮点（2026-10-21 用户要求可配置）。
 * 后台用换行分隔的纯文本维护，这里按行拆分；未配置时回退到默认四项。
 */
const DEFAULT_TEAM_FEATURES = ['TRO和解/应诉/起诉', '跨境知识产权服务', '涉外纠纷', '货代纠纷与劳动争议']
const teamFeaturesFromSettings = computed(() => {
  // 后台拆成四个独立输入框（亮点一~四），按 1→4 顺序渲染，留空的自动跳过
  const settings = siteSettings.value?.settings ?? {}
  const items = [
    settings.home_team_feature_1,
    settings.home_team_feature_2,
    settings.home_team_feature_3,
    settings.home_team_feature_4,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
  return items.length ? items : DEFAULT_TEAM_FEATURES
})

const teamParagraphsFromSettings = computed(() => {
  const value = siteSettings.value?.settings?.home_team_paragraphs
  // 后台按纯文本存储、一行一段，这里按换行拆分（兼容历史 json 数组）
  if (typeof value === 'string') {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return lines.length ? lines : teamIntro.paragraphs
  }
  if (!Array.isArray(value)) return teamIntro.paragraphs
  const paragraphs = value
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    .map((entry) => entry.trim())
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
    <section
      class="home-team-intro"
      :class="{ 'home-team-intro--has-background': teamBackgroundImage }"
      :style="teamBackgroundStyle"
      aria-label="团队介绍"
    >
      <div v-if="teamBackgroundImage" class="home-team-intro__scrim" aria-hidden="true" />
      <PageContainer>
        <div class="home-team-intro__layout">
          <div class="home-team-intro__content">
            <p class="home-team-intro__eyebrow">ABOUT US</p>
            <h1 class="home-team-intro__title">{{ teamDisplayTitle }}</h1>
            <p
              v-for="(paragraph, index) in teamParagraphsFromSettings"
              :key="index"
              class="home-team-intro__paragraph"
            >
              {{ paragraph }}
            </p>
            <ul class="home-team-intro__features">
              <li v-for="feature in teamFeaturesFromSettings" :key="feature">{{ feature }}</li>
            </ul>
            <div class="home-team-intro__actions">
              <NuxtLink to="/tro/cases" class="home-team-intro__button home-team-intro__button--primary">查询 TRO 案件</NuxtLink>
              <button type="button" class="home-team-intro__button home-team-intro__button--secondary" @click="openContactModal('tro')">联系我们免费评估案件</button>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>

    <section class="home-about" aria-label="数据概览">
      <PageContainer>
        <StatsSection class="home-about__stats" :stats="statsFromSettings" />
      </PageContainer>
    </section>

    <CoreBusiness :sections="teamServices" />

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
.home-team-intro {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding-block: clamp(3.5rem, 7vw, 6rem);
  background: var(--color-bg-page);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.home-team-intro__scrim {
  position: absolute;
  z-index: -1;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(10 18 31 / 78%) 0%, rgb(10 18 31 / 62%) 58%, rgb(10 18 31 / 38%) 100%),
    linear-gradient(0deg, rgb(10 18 31 / 18%), rgb(10 18 31 / 18%));
}

.home-team-intro__layout {
  display: flex;
  align-items: center;
  min-height: clamp(22rem, 42vw, 35rem);
}

.home-team-intro__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  min-width: 0;
  width: min(100%, 850px);
}

.home-team-intro__eyebrow {
  margin: 0;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: .12em;
}

.home-team-intro__title {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  font-weight: 800;
  line-height: 1.08;
}

.home-team-intro__paragraph {
  max-width: 48rem;
  margin: 0;
  color: var(--color-text-muted);
  font-size: clamp(1.05rem, 1.2vw, 1.2rem);
  font-weight: 500;
  line-height: 1.8;
}

.home-team-intro__features {
  display: grid;
  gap: var(--space-3) var(--space-8);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.home-team-intro__features li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.home-team-intro__features li::before {
  content: "✓";
  display: grid;
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 9%, white);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  place-items: center;
}

@media (max-width: 640px) {
  .home-team-intro__features {
    grid-template-columns: minmax(0, 1fr);
  }
}
.home-team-intro__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.home-team-intro__button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-6);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  transition: color var(--transition-base), background-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
  cursor: pointer;
}

.home-team-intro__button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.home-team-intro__button--primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.home-team-intro__button--secondary {
  background: transparent;
  color: var(--color-primary);
}

.home-team-intro--has-background .home-team-intro__eyebrow,
.home-team-intro--has-background .home-team-intro__title {
  color: #fff;
}

.home-team-intro--has-background .home-team-intro__paragraph,
.home-team-intro--has-background .home-team-intro__features li {
  color: rgb(255 255 255 / 94%);
  text-shadow: 0 1px 8px rgb(0 0 0 / 18%);
}

.home-team-intro--has-background .home-team-intro__features li::before {
  border-color: rgb(255 255 255 / 70%);
  background-color: rgb(255 255 255 / 16%);
  color: #fff;
}

.home-team-intro--has-background .home-team-intro__button--secondary {
  border-color: rgb(255 255 255 / 75%);
  background: rgb(255 255 255 / 13%);
  color: #fff;
  backdrop-filter: blur(8px);
}

/* 首页数据指标紧跟团队介绍，之后展示核心业务流程。 */
.home-about {
  padding-block: var(--space-8) var(--space-16);
  background-color: var(--color-bg-page);
}

.home-about__stats {
  margin-top: 0;
}

@media (max-width: 767px) {
  .home-team-intro__layout {
    min-height: 0;
  }

  .home-team-intro__scrim {
    background:
      linear-gradient(90deg, rgb(10 18 31 / 76%), rgb(10 18 31 / 58%)),
      linear-gradient(0deg, rgb(10 18 31 / 20%), rgb(10 18 31 / 20%));
  }
}

@media (max-width: 639px) {
  .home-team-intro { padding-block: var(--space-10); }
  .home-team-intro__features { grid-template-columns: minmax(0, 1fr); }
  .home-about {
    padding-block: var(--space-6) var(--space-12);
  }
}
</style>

<style scoped>
.home-content { padding-block:var(--space-section-compact); background:var(--color-bg-light); }
.home-content :deep(.case-preview-section), .home-content :deep(.article-preview-section) { padding:0 0 28px; background:transparent; }
.home-content :deep(.case-preview-section > .page-container), .home-content :deep(.article-preview-section > .page-container) { padding:0; }
.home-content :deep(.case-preview-section__grid) { grid-template-columns:1fr; }

</style>
