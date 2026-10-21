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
 * `readSettingText` 只接受字符串并按空格判断空值，图片配置可以是本地素材路径或 OSS URL。
 */
function readSettingText(key: string): string {
  const value = siteSettings.value?.settings?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const heroFromSettings = computed(() => ({
  badge: readSettingText('home_hero_badge'),
  titleImage: readSettingText('home_hero_title'),
  subtitle: readSettingText('home_hero_subtitle'),
  primaryLabel: readSettingText('home_hero_primary_label'),
  primaryLink: readSettingText('home_hero_primary_link'),
  secondaryLabel: readSettingText('home_hero_secondary_label'),
}))

/**
 * 团队介绍背景图（需求 2026-10-20）。
 *
 * 原来这一块是「左侧介绍 + 右侧四个业务块」的两栏布局，现改为
 * 「一整张背景图 + 图上左侧放介绍」，四个业务块移到下方独立成「核心业务」。
 * 未配置背景图时回退为主题色深色渐变，保证白字始终可读，而不是露出白底。
 */
const teamBackgroundImage = computed(() => readSettingText('home_team_background'))
const teamIntroStyle = computed(() => {
  const image = teamBackgroundImage.value
  return image ? { backgroundImage: `url("${image}")` } : {}
})

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
const teamDisplayTitle = computed(() => teamTitleFromSettings.value || '大信法务团队')
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

    <!--
      团队介绍（需求 2026-10-20）：一整张背景图 + 图上左侧放介绍。
      原来的「右侧四个业务块」已移出，成为下方独立的「核心业务」区块。

      2026-10-21 用户要求：标题单独放在首屏与团队介绍背景图之间，
      让两块图片不要直接贴在一起；样式参照「核心业务」的居中标题。
    -->
    <section class="home-team-heading" aria-label="团队介绍标题">
      <PageContainer>
        <SectionHeading align="center" eyebrow="ABOUT US" :title="teamDisplayTitle" />
      </PageContainer>
    </section>

    <section
      class="home-team-intro"
      :class="{ 'home-team-intro--image': teamBackgroundImage }"
      :style="teamIntroStyle"
      aria-label="团队介绍"
    >
      <PageContainer>
        <div class="home-team-intro__content">
          <p
            v-for="(paragraph, index) in teamParagraphsFromSettings"
            :key="index"
            class="home-team-intro__paragraph"
          >
            {{ paragraph }}
          </p>
          <!--
            四项业务亮点（2026-10-21 用户确认）：
            这四项属于「团队介绍」区块，不是首屏；前面带金色圆圈对号。
            旧站样例图里还有两个按钮，用户明确不要，故不渲染按钮。
          -->
          <ul class="home-team-intro__features">
            <li>TRO和解/应诉/起诉</li>
            <li>跨境知识产权服务</li>
            <li>涉外纠纷</li>
            <li>货代纠纷与劳动争议</li>
          </ul>
          <NuxtLink to="/about" class="home-team-intro__more">
            了解更多
            <span aria-hidden="true">→</span>
          </NuxtLink>
        </div>
      </PageContainer>
    </section>

    <!-- 核心业务：01-05 横向排列、悬停/点击展开 -->
    <CoreBusiness :sections="teamServices" />

    <section class="home-about" aria-label="数据概览">
      <PageContainer>
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
/*
 * 团队介绍（需求 2026-10-20）：一整张背景图 + 图上左侧放介绍。
 * 原来这里是「左介绍 + 右四个业务块」的两栏布局，业务块已移到下方「核心业务」。
 */
/* 标题单独占一段浅色区域，把首屏与团队介绍背景图隔开（用户要求） */
.home-team-heading {
  padding-block: var(--space-16) var(--space-10);
  background-color: var(--color-bg-light);
}
.home-team-intro {
  position: relative;
  /*
   * 与首屏拉开距离（2026-10-21 用户要求：首屏撑满一屏后，团队介绍往下拉、中间隔开一块）。
   * 首屏已用 min-height 占满视口，这里再加一段上下留白，视觉上形成独立区块。
   */
  padding-block: var(--space-20);
  /*
   * 未配置背景图时的兜底：主题深色渐变。
   * 用深色而不是白底，是因为文案在这里是白字，白底会直接看不见。
   */
  background-image: linear-gradient(
    120deg,
    var(--color-bg-dark) 0%,
    color-mix(in srgb, var(--color-primary) 58%, var(--color-bg-dark)) 100%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--color-text-inverse);
  isolation: isolate;
}

/* 有背景图时压一层自左向右减淡的深色遮罩，保证左侧介绍的对比度 */
.home-team-intro--image::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: linear-gradient(
    100deg,
    rgb(20 14 8 / 84%) 0%,
    rgb(20 14 8 / 66%) 40%,
    rgb(20 14 8 / 24%) 70%,
    rgb(20 14 8 / 0%) 100%
  );
  content: "";
}

.home-team-intro__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  /* 介绍贴左，右侧留给背景图内容 */
  max-width: 44rem;
  text-align: left;
}

/* SectionHeading 默认是深色字，深色底上必须反色，否则等于没字 */
.home-team-intro__content :deep(.section-heading) {
  align-items: flex-start;
  gap: var(--space-2);
  text-align: left;
}

.home-team-intro__content :deep(.section-heading__title) {
  color: var(--color-text-inverse);
  text-shadow: 0 2px 18px rgb(0 0 0 / 38%);
}

.home-team-intro__content :deep(.section-heading__eyebrow) {
  color: var(--color-accent);
  font-size: var(--text-sm);
}

.home-team-intro__content :deep(.section-heading__description) {
  color: color-mix(in srgb, var(--color-text-inverse) 84%, transparent);
}

/* 四项业务亮点：金色圆圈对号 + 文案，两列（窄屏单列） */
.home-team-intro__features {
  display: grid;
  gap: var(--space-3) var(--space-8);
  grid-template-columns: repeat(2, minmax(0, max-content));
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}

.home-team-intro__features li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-inverse);
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
  background-color: var(--color-accent);
  color: var(--color-primary-dark);
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
.home-team-intro__paragraph {
  margin: 0;
  color: color-mix(in srgb, var(--color-text-inverse) 88%, transparent);
  font-size: clamp(1.05rem, 1.2vw, 1.18rem);
  font-weight: 500;
  line-height: 1.75;
  text-shadow: 0 2px 14px rgb(0 0 0 / 34%);
}

.home-team-intro__more {
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: 600;
}

.home-team-intro__more:hover {
  color: var(--color-text-inverse);
}

/* 数据概览独立成块，跟在核心业务之后 */
.home-about {
  padding-block: var(--space-8) var(--space-16);
  background-color: var(--color-bg-page);
}

.home-about__stats {
  margin-top: 0;
}

@media (max-width: 767px) {
  /* 标题单独占一段浅色区域，把首屏与团队介绍背景图隔开（用户要求） */
.home-team-heading {
  padding-block: var(--space-16) var(--space-10);
  background-color: var(--color-bg-light);
}
.home-team-intro {
    padding-block: var(--space-12);
  }

  /* 窄屏背景图会被裁得只剩中间，把遮罩改成上下渐变，保证文字区够暗 */
  .home-team-intro--image::before {
    background-image: linear-gradient(
      180deg,
      rgb(20 14 8 / 78%) 0%,
      rgb(20 14 8 / 70%) 60%,
      rgb(20 14 8 / 58%) 100%
    );
  }

  .home-team-intro__content {
    max-width: none;
  }
}

@media (max-width: 639px) {
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

/* 首页 Banner：整幅图片，宽度撑满容器并保持原始比例 */
.home-banner { padding-block:var(--space-section-compact); }
.home-banner__img { display:block; width:100%; height:auto; border-radius:var(--radius-lg); }
@media (max-width: 767px) {
  .home-banner { padding-block:var(--space-6); }
  .home-banner__img { border-radius:var(--radius-md); }
}
</style>
