<script setup lang="ts">
import { computed } from 'vue'
import { businessCards, businessGroups } from '~/data/mock/businesses'

/**
 * 首页“核心业务”区域：按 国外业务 / 国内业务 分组渲染 BusinessCard。
 * 数据来自 Mock（业务条目全部出自需求文档）。
 */
const groups = computed(() =>
  (Object.keys(businessGroups) as Array<keyof typeof businessGroups>).map(key => ({
    ...businessGroups[key],
    cards: businessCards.filter(card => card.group === key)
  }))
)
</script>

<template>
  <section class="business-section" aria-label="核心业务">
    <PageContainer>
      <SectionHeading
        align="center"
        title="核心业务"
        description="国外业务聚焦 TRO 知识产权与出海合规，国内业务覆盖企业法律顾问与纠纷处理。"
      />
      <div
        v-for="group in groups"
        :key="group.id"
        class="business-section__group"
      >
        <div class="business-section__group-head">
          <h3 class="business-section__group-title">{{ group.title }}</h3>
          <p class="business-section__group-desc">{{ group.description }}</p>
        </div>
        <div class="business-section__grid">
          <BusinessCard
            v-for="card in group.cards"
            :key="card.id"
            :card="card"
          />
        </div>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.business-section {
  padding-block: var(--space-16);
  background-color: var(--color-bg-light);
}

.business-section__group {
  margin-top: var(--space-10);
}

.business-section__group-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-5);
}

.business-section__group-title {
  position: relative;
  padding-left: var(--space-4);
  font-size: var(--text-xl);
  color: var(--color-text);
}

.business-section__group-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 1.1em;
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
}

.business-section__group-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.business-section__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
}

/* 移动端：单列布局 */
@media (max-width: 639px) {
  .business-section {
    padding-block: var(--space-10);
  }

  .business-section__grid {
    grid-template-columns: 1fr;
  }
}
</style>
