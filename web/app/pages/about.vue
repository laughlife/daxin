<script setup lang="ts">
import { businessCards, businessGroups } from '~/data/mock/businesses'
import { homeHero, teamIntro } from '~/data/mock/home'
import { siteConfig } from '~/config/site'

/**
 * 关于我们（第一版）。
 * 文案来自需求文档初稿；正式图片、资质与团队素材待提供，
 * 页面内使用明确的占位说明，不伪造素材。
 */
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
    <section class="about-page__hero">
      <PageContainer size="narrow">
        <h1 class="about-page__title">关于大信法务</h1>
        <p class="about-page__slogan">{{ homeHero.title }}</p>
        <p class="about-page__subtitle">{{ homeHero.subtitle }}</p>
      </PageContainer>
    </section>

    <PageContainer size="narrow" class="about-page__body">
      <section class="about-page__section" aria-label="团队介绍">
        <SectionHeading title="团队介绍" />
        <p
          v-for="(paragraph, index) in teamIntro.paragraphs"
          :key="index"
          class="about-page__paragraph"
        >
          {{ paragraph }}
        </p>
        <p class="about-page__notice" role="note">
          本页文案来自《大信团队官网需求文档》初稿，待甲方最终确认；团队照片、律师简介与资质证书等正式素材待提供，当前不展示任何虚构素材。
        </p>
      </section>

      <section class="about-page__section" aria-label="核心业务">
        <SectionHeading
          title="核心业务"
          description="业务条目来自需求文档；各业务专页将在后续任务中实现。"
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

      <section class="about-page__section" aria-label="联系方式">
        <SectionHeading
          title="联系方式"
          :description="siteConfig.contact.notice"
        />
        <ul class="about-page__contact">
          <li
            v-for="channel in siteConfig.contact.wechatAccounts"
            :key="channel.id"
          >
            {{ channel.name }}：<strong>{{ channel.wechatId }}</strong>
            <span class="about-page__contact-purpose">（{{ channel.purpose }}）</span>
          </li>
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
          <li>地址：{{ siteConfig.contact.address }}</li>
        </ul>
        <div class="about-page__actions">
          <BaseButton to="/tro/cases" variant="primary">查询 TRO 案件</BaseButton>
          <BaseButton to="/infringement-check" variant="secondary">
            {{ siteConfig.cta.label }}
          </BaseButton>
        </div>
      </section>
    </PageContainer>
  </div>
</template>

<style scoped>
.about-page__hero {
  padding-block: var(--space-12);
  background-color: var(--color-bg-dark);
  color: var(--color-text-inverse);
  text-align: center;
}

.about-page__title {
  font-size: var(--text-4xl);
}

.about-page__slogan {
  margin-top: var(--space-3);
  font-size: var(--text-xl);
  color: var(--color-accent);
  font-weight: 600;
}

.about-page__subtitle {
  margin-top: var(--space-3);
  color: color-mix(in srgb, var(--color-text-inverse) 75%, transparent);
  font-size: var(--text-sm);
}

.about-page__body {
  padding-block: var(--space-10) var(--space-16);
  background-color: var(--color-bg-page);
}

.about-page__section {
  padding-block: var(--space-8);
}

.about-page__section + .about-page__section {
  border-top: 1px solid var(--color-border);
}

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
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.about-page__business {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.about-page__contact {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
  color: var(--color-text);
}

.about-page__contact strong {
  color: var(--color-primary);
}

.about-page__contact-purpose {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.about-page__actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-6);
}

@media (max-width: 767px) {
  .about-page__principles {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .about-page__hero {
    padding-block: var(--space-10);
  }

  .about-page__title {
    font-size: var(--text-3xl);
  }
}
</style>
