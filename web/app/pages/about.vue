<script setup lang="ts">
import { fetchArticles } from '~/repositories/articles'
import { toAboutContent } from '~/utils/aboutContent'

/**
 * 关于我们。
 *
 * 结构按旧站 http://yan1.qinianyun.com/about/ 恢复，顺序为：
 *   欢迎标题 + 公司介绍 → 团队介绍 → 24H/7 联系引导 → TRO 成功案例 → 企业宣讲 → 我们的小伙伴。
 * 旧站该页曾有的「扫码领取 TRO 侵权大礼包」区域按需求删除，页面内不再出现。
 *
 * 文案与图片全部来自数据库配置（site_settings 的 about 组），可在后台编辑；
 * 图片经 media_assets 上传后写入配置，因此这里只渲染配置里已有的地址，
 * 未配置时不显示假图，也不显示占位图片。
 * TRO 成功案例来自公开文章接口，分类由配置项 about_success_category 指定。
 */
const { data: settings, error: settingsError, refresh: refreshSettings } = await useSiteSettings()

const about = computed(() => toAboutContent(settings.value))

const { data: successData, error: successError, refresh: refreshSuccess } = await useAsyncData(
  'about-success-cases',
  () => fetchArticles({ category: 'tro-success', pageSize: 5 })
)
const successArticles = computed(() => successData.value?.items ?? [])
const successErrorMessage = computed(() =>
  successError.value instanceof Error && successError.value.message
    ? successError.value.message
    : '成功案例加载失败，请稍后重试'
)

/** 联系信息直接取站点配置的 contact 分组，避免与页脚各写一份。 */
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
    <PageContainer class="about-page__body">
      <ErrorState
        v-if="settingsError"
        title="页面内容加载失败"
        :message="settingsError instanceof Error && settingsError.message ? settingsError.message : '关于我们内容加载失败，请稍后重试'"
        @retry="refreshSettings"
      />
      <template v-else>
        <ContentColumns>
          <!-- 1. 欢迎与公司介绍（旧站首屏） -->
          <section class="about-page__section about-page__hero" aria-label="公司介绍">
            <p class="about-page__welcome">{{ about.welcome }}</p>
            <h1 class="about-page__intro-title">{{ about.heroTitle }}</h1>
            <p v-if="about.heroParagraph" class="about-page__paragraph">{{ about.heroParagraph }}</p>
          </section>

          <!-- 2. 团队介绍 -->
          <section class="about-page__section" aria-label="团队介绍">
            <SectionHeading title="团队介绍" />
            <p
              v-for="(paragraph, index) in about.teamParagraphs"
              :key="index"
              class="about-page__paragraph"
            >
              {{ paragraph }}
            </p>
            <p v-if="about.teamParagraphs.length === 0" class="about-page__notice" role="note">
              团队介绍文案尚未在后台配置。
            </p>
          </section>

          <!-- 荣誉 / 资质图片：后台配置后才显示 -->
          <section v-if="about.honorsImages.length > 0" class="about-page__section" aria-label="荣誉资质">
            <SectionHeading title="荣誉与资质" />
            <ul class="about-page__gallery">
              <li v-for="(src, index) in about.honorsImages" :key="index">
                <img :src="src" alt="大信法务荣誉与资质" loading="lazy">
              </li>
            </ul>
          </section>

          <!-- 3. 24H/7 联系引导（旧站中段） -->
          <section class="about-page__section about-page__contact" aria-label="联系我们">
            <h2 class="about-page__contact-title">{{ about.contactTitle }}</h2>
            <p class="about-page__contact-lines">
              <a v-if="contactPhone" :href="`tel:${contactPhone}`">{{ contactPhone }}</a>
              <span v-if="contactPhone && contactEmail" aria-hidden="true"> / </span>
              <a v-if="contactEmail" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
            </p>
          </section>

          <!-- 4. TRO 成功案例 -->
          <section class="about-page__section" aria-label="成功案例">
            <SectionHeading :title="about.successTitle" description="精选成功案例，结果与金额按记录展示。" />
            <ErrorState
              v-if="successError"
              title="成功案例加载失败"
              :message="successErrorMessage"
              @retry="refreshSuccess"
            />
            <ArticleList v-else :articles="successArticles" />
            <NuxtLink class="about-page__more" to="/tro/success-cases">查看全部成功案例 →</NuxtLink>
          </section>

          <!-- 5. 企业宣讲 -->
          <section class="about-page__section" aria-label="企业宣讲">
            <SectionHeading :title="about.lectureTitle" description="围绕知识产权、劳动用工与合同风控，提供适合跨境企业的培训主题。" />
            <ul v-if="about.lectureImages.length > 0" class="about-page__gallery">
              <li v-for="(src, index) in about.lectureImages" :key="index">
                <img :src="src" alt="大信法务企业宣讲现场" loading="lazy">
              </li>
            </ul>
            <p v-else class="about-page__notice" role="note">
              宣讲现场图片尚未上传。可在「后台 → 站点设置 → 关于我们」的 about_lecture_images 中配置。
            </p>
            <NuxtLink class="about-page__more" to="/about/lectures">查看宣讲主题与详情 →</NuxtLink>
          </section>

          <!-- 6. 我们的小伙伴：PartnerStrip 自带标题，这里不再重复渲染 SectionHeading -->
          <section class="about-page__section about-page__partners" aria-label="我们的小伙伴">
            <ul v-if="about.partnerImages.length > 0" class="about-page__gallery">
              <li v-for="(src, index) in about.partnerImages" :key="index">
                <img :src="src" :alt="`${about.partnerTitle}合作伙伴`" loading="lazy">
              </li>
            </ul>
            <PartnerStrip v-else />
          </section>
        </ContentColumns>
      </template>
    </PageContainer>
  </div>
</template>

<style scoped>
.about-page { background: var(--color-bg-light); }
.about-page__body { padding-block: var(--space-8) var(--space-16); }
.about-page__section { padding:28px; border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.about-page__section + .about-page__section { margin-top:24px; }

.about-page__welcome { color:var(--color-text-muted); font-size:var(--text-sm); letter-spacing:.05em; }
.about-page__intro-title { margin-top:var(--space-2); font-size:var(--text-3xl); line-height:1.4; }

.about-page__contact { text-align:center; }
.about-page__contact-title { font-size:var(--text-xl); color:var(--color-text); }
.about-page__contact-lines { margin-top:var(--space-3); font-size:var(--text-lg); }
.about-page__contact-lines a { color:var(--color-primary); font-weight:600; }
.about-page__contact-lines a:hover { text-decoration:underline; }

.about-page__gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:var(--space-3); margin-top:var(--space-4); list-style:none; padding:0; }
.about-page__gallery img { display:block; width:100%; height:auto; border-radius:var(--radius-md); }

.about-page__more { display:inline-flex; margin-top:20px; color:var(--color-primary); font-weight:600; font-size:var(--text-sm); }
.about-page__more:hover { text-decoration:underline; }

.about-page__paragraph {
  margin-top: var(--space-4);
  line-height: var(--leading-relaxed);
  color: var(--color-text);
}

.about-page__notice {
  margin-top: var(--space-4);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
}

@media (max-width: 639px) {
  .about-page__body { padding-block:var(--space-5) var(--space-10); }
  .about-page__section { padding:20px; }
  .about-page__intro-title { font-size:var(--text-2xl); }
  .about-page__gallery { grid-template-columns:1fr; }
}
</style>
