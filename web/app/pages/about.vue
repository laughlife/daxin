<script setup lang="ts">
import { businessCards, businessGroups } from '~/config/businessContent'
import { teamIntro } from '~/config/homeContent'
import { fetchArticles } from '~/repositories/articles'

/**
 * 关于我们（第一版）。
 * 文案来自需求文档初稿；正式图片、资质与团队素材待提供，
 * 页面内使用明确的占位说明，不伪造素材。
 * TRO 成功案例来自公开文章接口的 tro-success 分类。
 */
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

const businessGroupsList = (['overseas', 'domestic'] as const).map(key => ({
  key,
  title: businessGroups[key].title,
  cards: businessCards.filter(card => card.group === key)
}))

const principles = [
  {
    id: 'full-chain',
    title: '全链路',
    description: '覆盖海运、空运物流与跨境电商经营全链条的法律风险防控与争议处理。'
  },
  {
    id: 'cross-jurisdiction',
    title: '跨法域',
    description: '协同国内外执业律师资源，处理 TRO、CPSC、州法案等跨法域事务。'
  },
  {
    id: 'high-effectiveness',
    title: '高实效',
    description: '7×24 小时响应，以解决问题为导向，高效处理货损、欠款、维权等争议。'
  }
]

useSeoMeta({
  title: '关于我们',
  description:
    '大信法务团队成立于 2019 年，主营海运、空运全链路法律业务，覆盖 TRO 知识产权、CPSC 召回、加州 65 号法案、劳动合规、合同风控与海关合规。（文案来自需求文档初稿，待甲方最终确认）',
  ogTitle: '关于我们 - 大信法务',
  ogDescription:
    '大信法务团队成立于 2019 年，为跨境电商企业、品牌卖家及供应链伙伴提供全链路、跨法域、高实效的法律顾问服务。'
})
</script>

<template>
  <div class="about-page">
    <PageContainer class="about-page__body"><ContentColumns>
      <section class="about-page__section" aria-label="团队介绍">
        <h1 class="about-page__intro-title">团队介绍</h1>
        <p
          v-for="(paragraph, index) in teamIntro.paragraphs"
          :key="index"
          class="about-page__paragraph"
        >
          {{ paragraph }}
        </p>
        <p class="about-page__paragraph">大信法务团队坚持以维护客户利益为导向，结合客户需求与具体经营场景，为跨境从业者提供法律服务与解决方案。</p>
        <p class="about-page__notice" role="note">
          本页文案来自《大信团队官网需求文档》初稿，待甲方最终确认；团队照片、律师简介与资质证书等正式素材待提供，当前不展示任何虚构素材。
        </p>
      </section>

      <section class="about-page__section" aria-label="核心业务">
        <SectionHeading
          title="核心业务"
          description="围绕跨境企业经营，覆盖国外与国内法律服务。"
        />
        <div
          v-for="group in businessGroupsList"
          :key="group.key"
          class="about-page__group"
        >
          <h3 class="about-page__group-title">{{ group.title }}</h3>
          <ul class="about-page__business-list">
            <li
              v-for="card in group.cards"
              :key="card.id"
              class="about-page__business"
            >
              <strong>{{ card.title }}</strong>
              <span>{{ card.items.join(' / ') }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="about-page__section" aria-label="服务理念">
        <SectionHeading title="服务理念" />
        <ul class="about-page__principles">
          <li v-for="principle in principles" :key="principle.id">
            <h3 class="about-page__principle-title">{{ principle.title }}</h3>
            <p class="about-page__principle-desc">{{ principle.description }}</p>
          </li>
        </ul>
      </section>

      <section class="about-page__section" aria-label="成功案例">
        <SectionHeading title="TRO 成功案例" description="精选成功案例，结果与金额按记录展示。" />
        <ErrorState
          v-if="successError"
          title="成功案例加载失败"
          :message="successErrorMessage"
          @retry="refreshSuccess"
        />
        <ArticleList v-else :articles="successArticles" />
        <NuxtLink class="about-page__more" to="/tro/success-cases">查看全部成功案例 →</NuxtLink>
      </section>
      <section class="about-page__section" aria-label="企业宣讲">
        <SectionHeading title="企业宣讲" description="围绕知识产权、劳动用工与合同风控，提供适合跨境企业的培训主题。" />
        <div class="about-page__lecture-frame">
        <img
          class="about-page__lecture-photos"
          src="/images/lectures/enterprise-lectures.jpg"
          alt="大信法务企业宣讲现场照片合集，来自官网需求文档"
          width="1563"
          height="810"
          loading="lazy"
        >
        </div>
        <NuxtLink class="about-page__more" to="/about/lectures">查看宣讲主题与详情 →</NuxtLink>
      </section>
      <section class="about-page__section about-page__partners" aria-label="我们的小伙伴">
        <PartnerStrip />
      </section>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.about-page { background:var(--color-bg-light); }
.about-page__body { padding-block:var(--space-8) var(--space-16); }
.about-page__section { padding:28px; border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.about-page__section + .about-page__section { margin-top:24px; }
.about-page__intro-title { font-size:var(--text-3xl); line-height:1.4; }
.about-page__lecture-frame { overflow:hidden; margin:20px auto 24px; border-radius:var(--radius-md); }
/* 原图顶部 40px 是截断标题；仅隐藏这部分，完整保留照片。 */
.about-page__lecture-photos { display:block; width:100%; height:auto; margin-top:-2.56%; }
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

.about-page__group {
  margin-top: var(--space-5);
}

.about-page__group-title {
  font-size: var(--text-lg);
  color: var(--color-primary);
  margin-bottom: var(--space-3);
}

.about-page__business-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.about-page__business {
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.7;
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-bg-light);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.about-page__business strong {
  color: var(--color-text);
}

.about-page__business span {
  color: var(--color-text-muted);
}

.about-page__principles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.about-page__principles li {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-top: 3px solid var(--color-primary);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-page);
}

.about-page__principle-title {
  font-size: var(--text-lg);
  color: var(--color-text);
}

.about-page__principle-desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}


@media (max-width: 767px) {
  .about-page__principles {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .about-page__body { padding-block:var(--space-5) var(--space-10); }
  .about-page__section { padding:20px; }
  .about-page__business-list { grid-template-columns:1fr; }
  .about-page__intro-title { font-size:var(--text-2xl); }
}
</style>
