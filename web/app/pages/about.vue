<script setup lang="ts">
import { businessCards } from '~/config/businessContent'
import { fetchArticles } from '~/repositories/articles'
import { toAboutContent } from '~/utils/aboutContent'

/**
 * 关于我们。
 *
 * 结构与文案按旧站 http://yan1.qinianyun.com/about/ 对齐（已用 Playwright 抓取整页比对）：
 *   1. 首屏：左侧配图（旧站为法庭天平图）+ 右侧「欢迎您来访」标题、公司名、三段介绍、24H 联系
 *   2. 核心业务：四块业务卡片（与首页同一份文案）
 *   3. TRO 成功案例（标题带 TRO SUCCESS STORIES 副标题）
 *   4. 企业宣讲（4 列图片网格，旧站 14 张）
 *   5. 我们的小伙伴（合作伙伴 logo 墙）
 *
 * 旧站该页顶部的「扫码领取 TRO 侵权大礼包」扫码区按需求**不保留**。
 * 文案与图片全部来自数据库配置（site_settings 的 about 组），可在后台编辑；
 * 未配置图片时不渲染空白框。页面样式沿用新站设计系统（红色主色、统一间距与圆角），
 * 只对齐旧站的模块顺序与信息结构。
 */
const { data: settings, error: settingsError, refresh: refreshSettings } = await useSiteSettings()

const about = computed(() => toAboutContent(settings.value))

const { data: successData, error: successError, refresh: refreshSuccess } = await useAsyncData(
  'about-success-cases',
  () => fetchArticles({ category: 'tro-success', pageSize: 4 })
)
const successArticles = computed(() => successData.value?.items ?? [])
const successErrorMessage = computed(() =>
  successError.value instanceof Error && successError.value.message
    ? successError.value.message
    : '成功案例加载失败，请稍后重试'
)

const contact = computed(() => settings.value?.contact ?? {})
const contactPhone = computed(() => contact.value.phone ?? '')
const contactEmail = computed(() => contact.value.email ?? '')

useSeoMeta({
  title: '关于我们',
  description: '大信法务团队主营海运、空运全链路法律业务，覆盖 TRO、合同风控、海关合规与劳动用工合规，可代理各类纠纷诉讼。',
  ogTitle: '关于我们 - 大信法务',
  ogDescription: '大信法务团队为跨境电商企业、品牌卖家及供应链伙伴提供全链路、跨法域、高实效的法律顾问服务。'
})
</script>

<template>
  <div class="about-page">
    <PageContainer>
      <ErrorState
        v-if="settingsError"
        title="页面内容加载失败"
        :message="settingsError instanceof Error && settingsError.message ? settingsError.message : '关于我们内容加载失败，请稍后重试'"
        @retry="refreshSettings"
      />
      <template v-else>
        <!-- 1. 首屏：左图右文（旧站同位置为法庭天平图 + 公司介绍） -->
        <section class="about-page__hero" aria-label="公司介绍">
          <figure v-if="about.heroImage" class="about-page__hero-figure">
            <img :src="about.heroImage" alt="大信法务团队" loading="lazy">
          </figure>
          <div class="about-page__hero-body">
            <p class="about-page__welcome">{{ about.welcome }}</p>
            <h1 class="about-page__title">{{ about.heroTitle }}</h1>
            <p v-if="about.heroParagraph" class="about-page__lead">{{ about.heroParagraph }}</p>
            <div v-for="(paragraph, index) in about.teamParagraphs" :key="index" class="about-page__paragraph">
              {{ paragraph }}
            </div>
            <div class="about-page__contact">
              <h2 class="about-page__contact-title">{{ about.contactTitle }}</h2>
              <p class="about-page__contact-lines">
                <a v-if="contactPhone" :href="`tel:${contactPhone}`">{{ contactPhone }}</a>
                <span v-if="contactPhone && contactEmail" aria-hidden="true">或</span>
                <a v-if="contactEmail" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
              </p>
            </div>
          </div>
        </section>

        <!-- 2. 核心业务：与首页共用同一份四板块文案 -->
        <section class="about-page__section" aria-label="核心业务">
          <SectionHeading
            align="center"
            title="核心业务"
            description="覆盖跨境知识产权、产品合规、涉外纠纷与国内企业法律顾问四大板块。"
          />
          <div class="about-page__business-grid">
            <BusinessCard
              v-for="card in businessCards"
              :key="card.id"
              :card="card"
            />
          </div>
        </section>

        <!-- 3. TRO 成功案例 -->
        <section class="about-page__section" aria-label="成功案例">
          <SectionHeading
            align="center"
            eyebrow="TRO SUCCESS STORIES"
            :title="about.successTitle"
            description="精选成功案例，结果与金额按记录展示。"
          />
          <ErrorState
            v-if="successError"
            title="成功案例加载失败"
            :message="successErrorMessage"
            @retry="refreshSuccess"
          />
          <template v-else>
            <ArticleList :articles="successArticles" />
            <p class="about-page__more">
              <NuxtLink to="/tro/success-cases">查看全部成功案例 →</NuxtLink>
            </p>
          </template>
        </section>

        <!-- 4. 企业宣讲：4 列图片网格 -->
        <section class="about-page__section" aria-label="企业宣讲">
          <SectionHeading
            align="center"
            eyebrow="COMPANY PRESENTATION"
            :title="about.lectureTitle"
            description="围绕知识产权、劳动用工与合同风控，提供适合跨境企业的培训主题。"
          />
          <ul v-if="about.lectureImages.length > 0" class="about-page__gallery">
            <li v-for="(src, index) in about.lectureImages" :key="index">
              <img :src="src" alt="大信法务企业宣讲现场" loading="lazy">
            </li>
          </ul>
          <p v-else class="about-page__notice" role="note">
            宣讲现场图片尚未上传。可在「后台 → 站点设置 → 关于我们」的 about_lecture_images 中配置。
          </p>
        </section>

        <!-- 5. 我们的小伙伴：合作伙伴 logo 墙 -->
        <section class="about-page__section" aria-label="我们的小伙伴">
          <SectionHeading
            align="center"
            eyebrow="OUR FRIENDS"
            :title="about.partnerTitle"
          />
          <ul v-if="about.partnerImages.length > 0" class="about-page__partners">
            <li v-for="(src, index) in about.partnerImages" :key="index">
              <img :src="src" :alt="`${about.partnerTitle}合作伙伴`" loading="lazy">
            </li>
          </ul>
          <PartnerStrip v-else />
        </section>
      </template>
    </PageContainer>
  </div>
</template>

<style scoped>
/*
 * 视觉样式复刻旧站 http://yan1.qinianyun.com/about/，配色替换为本站设计令牌。
 *
 * 已对照旧站计算样式对齐的要点：
 *   - 区块大标题 36px / 700 / 深灰、居中，区块标题块与内容间距约 56px；
 *   - 英文副标题 18–20px / 500、大写、主色，两侧各有 60×2px 主色短线（在 SectionHeading 内实现）；
 *   - 首屏为「左图右文」，右侧依次是主色底白字欢迎标签、大标题、段落、24H 联系；
 *   - 文字类内容行高宽松（旧站约 1.7–1.8），段间距统一；
 *   - 企业宣讲为 4 列图片网格、图片圆角；
 *   - 我们的小伙伴为整幅合作伙伴图。
 * 旧站的「国内业务/国外业务」红色横条分组在上一轮已按需求方确认改为四块平铺，
 * 因此这里不再恢复该横条，仅沿用其标题与卡片视觉语言。
 */
.about-page {
  padding-block: var(--space-10) var(--space-16);
  background-color: var(--color-bg-light);
}

/* 旧站的区块标题尺度（36px）与标题块下间距（约 56px），仅作用于本页 */
.about-page :deep(.section-heading__title) {
  font-size: var(--text-4xl);
  line-height: 1.2;
}

.about-page :deep(.section-heading) {
  margin-bottom: var(--space-12);
}

/* 1. 首屏：旧站为「左图右文」，窄屏改为上下 */
.about-page__hero {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-8);
  background-color: var(--color-bg-page);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.about-page__hero-figure {
  margin: 0;
}

.about-page__hero-figure img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
}

/* 旧站欢迎标签为主色底白字小标签 */
.about-page__welcome {
  display: inline-block;
  margin-bottom: var(--space-3);
  padding: 3px var(--space-4);
  border-radius: var(--radius-sm);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 500;
}

.about-page__title {
  font-size: var(--text-4xl);
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text);
}

.about-page__lead {
  margin-top: var(--space-4);
  font-weight: 600;
  line-height: var(--leading-relaxed);
  color: var(--color-text);
}

.about-page__paragraph {
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  color: var(--color-text-muted);
}

.about-page__contact {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.about-page__contact-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}

.about-page__contact-lines {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}

.about-page__contact-lines a {
  color: var(--color-primary);
  font-weight: 600;
}

.about-page__section {
  margin-top: var(--space-16);
}

/* 2. 核心业务：2×2 平铺，与首页一致 */
.about-page__business-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
}

/* 4. 企业宣讲：旧站为 4 列网格 */
.about-page__gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  list-style: none;
  padding: 0;
}

.about-page__gallery img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.about-page__gallery img:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

/* 5. 我们的小伙伴：旧站为一张整图，这里保持单张铺满 */
.about-page__partners {
  list-style: none;
  padding: 0;
}

.about-page__partners img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
}

.about-page__more {
  margin-top: var(--space-6);
  text-align: center;
}

.about-page__more a {
  color: var(--color-primary);
  font-weight: 600;
}

.about-page__notice {
  margin-top: var(--space-6);
  padding: var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

@media (max-width: 1023px) {
  .about-page__hero {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }

  .about-page__gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* 窄屏下用较小的标题尺度，避免 36px 在手机上一行放不下 */
  .about-page :deep(.section-heading__title) {
    font-size: var(--text-3xl);
  }

  .about-page :deep(.section-heading__eyebrow) {
    font-size: var(--text-base);
  }

  .about-page :deep(.section-heading__eyebrow::before),
  .about-page :deep(.section-heading__eyebrow::after) {
    width: 32px;
  }
}

@media (max-width: 767px) {
  .about-page__business-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .about-page__hero {
    padding: var(--space-5);
  }

  .about-page__title {
    font-size: var(--text-3xl);
  }
}
</style>
