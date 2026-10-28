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
const statsBackgroundStyle = computed(() => {
  const image = readSettingText('home_stats_background')
  return image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined
})
const coreBusinessBackgroundImage = computed(() => readSettingText('home_core_business_background'))
const coreBusinessCoverImages = computed(() => Array.from(
  { length: homeData.value?.teamServices.length ?? 0 },
  (_, index) => readSettingText(`home_core_business_cover_${index + 1}`),
))
const coreAdvantagesBackgroundImage = computed(() => readSettingText('home_core_advantages_background'))
const coreAdvantageCoverImages = computed(() => Array.from(
  { length: homeData.value?.coreAdvantages.length ?? 0 },
  (_, index) => readSettingText(`home_core_advantage_cover_${index + 1}`),
))
const coreAdvantageExpandedImages = computed(() => Array.from(
  { length: homeData.value?.coreAdvantages.length ?? 0 },
  (_, index) => readSettingText(`home_core_advantage_expanded_${index + 1}`),
))

/** 数据概览：配置里是 JSON 数组，非数组时回退静态配置。 */
const statsFromSettings = computed(() => {
  const value = siteSettings.value?.settings?.home_stats
  if (!Array.isArray(value) || value.length === 0) return homeStats
  const items = value
    .map((item, index) => {
      const record = (item ?? {}) as Record<string, unknown>
      return {
        value: String(record.value ?? ''),
        label: record.label == null ? (homeStats[index]?.label ?? '') : String(record.label),
        description: String(record.description ?? ''),
      }
    })
    .filter((item) => item.value || item.description)
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

/** 按参考图在“实力律师”和“全链路”之后换行；保留配置中的原始文字。 */
function splitTeamParagraph(paragraph: string): string[] {
  const markers = ['实力律师', '全链路']
  const lines: string[] = []
  let remaining = paragraph

  while (remaining) {
    const match = markers
      .map(marker => ({ marker, index: remaining.indexOf(marker) }))
      .filter(item => item.index >= 0)
      .sort((left, right) => left.index - right.index)[0]
    if (!match) {
      lines.push(remaining)
      break
    }

    const markerEnd = match.index + match.marker.length
    const punctuation = remaining.slice(markerEnd).match(/^[，、。！？；：,.;!?]/u)?.[0] ?? ''
    const splitAt = markerEnd + punctuation.length
    if (splitAt >= remaining.length) {
      lines.push(remaining)
      break
    }

    lines.push(remaining.slice(0, splitAt).trimEnd())
    remaining = remaining.slice(splitAt).trimStart()
  }

  return lines.length ? lines : [paragraph]
}

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
      aria-label="团队介绍"
    >
      <div v-if="teamBackgroundImage" class="home-team-intro__background" :style="teamBackgroundStyle" aria-hidden="true" />
      <PageContainer>
        <div class="home-team-intro__layout">
          <div class="home-team-intro__content">
            <h1 class="home-team-intro__title">{{ teamDisplayTitle }}</h1>
            <p
              v-for="(paragraph, index) in teamParagraphsFromSettings"
              :key="index"
              class="home-team-intro__paragraph"
            >
              <template v-for="(line, lineIndex) in splitTeamParagraph(paragraph)" :key="`${index}-${lineIndex}`">
                <br v-if="lineIndex > 0">
                {{ line }}
              </template>
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

    <section class="home-about" aria-label="数据概览" :style="statsBackgroundStyle">
      <PageContainer>
        <StatsSection class="home-about__stats" :stats="statsFromSettings" />
      </PageContainer>
    </section>

    <CoreBusiness
      :sections="teamServices"
      :background-image="coreBusinessBackgroundImage"
      :cover-images="coreBusinessCoverImages"
    />

    <HomeCoreAdvantages
      :items="coreAdvantages"
      :background-image="coreAdvantagesBackgroundImage"
      :cover-images="coreAdvantageCoverImages"
      :expanded-images="coreAdvantageExpandedImages"
    />
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
  padding-block: clamp(2.5rem, 5vw, 4rem);
  background: #101a2a;
}

.home-team-intro__background {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: brightness(1.18);
}

.home-team-intro__layout {
  display: flex;
  align-items: center;
  min-height: clamp(34rem, 48vw, 62rem);
}

.home-team-intro__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  min-width: 0;
  width: min(100%, 900px);
}

.home-team-intro__title {
  width: 100%;
  margin: 0;
  color: var(--color-text);
  font-size: clamp(2.75rem, 4.4vw, 5.5rem);
  font-weight: 800;
  line-height: 1.12;
  text-shadow: 0 2px 16px rgb(0 0 0 / 18%);
}

.home-team-intro__title::after {
  display: block;
  width: min(100%, 820px);
  height: 4px;
  margin-top: clamp(1rem, 2vw, 2rem);
  background: linear-gradient(90deg, var(--color-home-highlight) 0 18%, rgb(255 255 255 / 34%) 18% 100%);
  content: "";
}

.home-team-intro__paragraph {
  max-width: 34em;
  margin: 0;
  color: var(--color-text-muted);
  font-size: clamp(1.1rem, 1.4vw, 1.5rem);
  font-weight: 500;
  line-height: 1.65;
}

.home-team-intro__features {
  --team-feature-row-gap: clamp(1.25rem, 2.7vw, 3.5rem);
  display: grid;
  row-gap: var(--team-feature-row-gap);
  column-gap: clamp(1.25rem, 3vw, 3rem);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: var(--team-feature-row-gap) 0 0;
  padding: 0;
  list-style: none;
}

.home-team-intro__features li {
  display: flex;
  align-items: center;
  gap: clamp(.75rem, 1vw, 1.25rem);
  color: var(--color-text-muted);
  font-size: clamp(1.05rem, 1.45vw, 1.5rem);
  font-weight: 500;
}

.home-team-intro__features li::before {
  content: "";
  display: grid;
  flex: none;
  width: clamp(1.8rem, 2vw, 2.4rem);
  height: clamp(1.8rem, 2vw, 2.4rem);
  border-radius: 50%;
  border: 0;
  background-color: var(--color-home-highlight);
  place-items: center;
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cmask id='m'%3E%3Crect width='40' height='40' fill='white'/%3E%3Cpath d='M9 20l7 7 15-16' fill='none' stroke='black' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/mask%3E%3Ccircle cx='20' cy='20' r='20' fill='white' mask='url(%23m)'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cmask id='m'%3E%3Crect width='40' height='40' fill='white'/%3E%3Cpath d='M9 20l7 7 15-16' fill='none' stroke='black' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/mask%3E%3Ccircle cx='20' cy='20' r='20' fill='white' mask='url(%23m)'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

@media (max-width: 640px) {
  .home-team-intro__features {
    grid-template-columns: minmax(0, 1fr);
  }
}
.home-team-intro__actions {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(.75rem, 1.2vw, 1.25rem);
  margin-top: clamp(1.5rem, 3vw, 3rem);
}

.home-team-intro__button {
  display: inline-flex;
  min-height: clamp(3.5rem, 5.4vw, 6.75rem);
  align-items: center;
  justify-content: center;
  padding: 0 clamp(1.5rem, 3.4vw, 3.75rem);
  border: 1px solid transparent;
  border-radius: clamp(1rem, 1.4vw, 1.75rem);
  font: inherit;
  font-size: clamp(1.15rem, 1.9vw, 2rem);
  font-weight: 800;
  text-decoration: none;
  transition: color var(--transition-base), background-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
  cursor: pointer;
}

.home-team-intro__button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.home-team-intro__button--primary {
  border-color: #fff;
  background: #fff;
  color: var(--color-home-highlight);
}

.home-team-intro__button--secondary {
  border-color: var(--color-home-highlight);
  background: var(--color-home-highlight);
  color: #fff;
}

.home-team-intro--has-background .home-team-intro__title {
  color: #fff;
}

.home-team-intro--has-background .home-team-intro__paragraph,
.home-team-intro--has-background .home-team-intro__features li {
  color: rgb(255 255 255 / 94%);
  text-shadow: 0 1px 8px rgb(0 0 0 / 18%);
}

/* 首页数据指标紧跟团队介绍，之后展示核心业务流程。 */
.home-about {
  padding-block: clamp(var(--space-8), 4vw, var(--space-12));
  background-color: #f7f7f7;
  background-image: url('/images/backgrounds/home-stats-wave.png');
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.home-about__stats {
  margin-top: 0;
}

@media (max-width: 767px) {
  .home-team-intro__layout {
    min-height: 0;
  }

  .home-team-intro__background {
    background-position: 64% center;
    filter: brightness(1.08);
  }
}

@media (max-width: 639px) {
  .home-team-intro { padding-block: var(--space-10); }
  .home-team-intro__features { grid-template-columns: minmax(0, 1fr); }
  .home-about {
    padding-block: var(--space-8);
  }
}
</style>

<style scoped>
.home-content { padding-block:var(--space-section-compact); background:var(--color-bg-page); }
.home-content :deep(.case-preview-section), .home-content :deep(.article-preview-section) { padding:0 0 28px; background:transparent; }
.home-content :deep(.case-preview-section > .page-container), .home-content :deep(.article-preview-section > .page-container) { padding:0; }
.home-content :deep(.case-preview-section__grid) { grid-template-columns:1fr; }

</style>
