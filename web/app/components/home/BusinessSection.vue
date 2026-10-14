<script setup lang="ts">
import { computed } from 'vue'
import { businessCards, businessSection } from '~/config/businessContent'

/**
 * 首页「核心业务」区域。
 *
 * 需求方确认：四个板块**平铺为 2×2 网格**，不再按「国外业务 / 国内业务」分组，
 * 因此这里直接渲染 businessCards，不再按 group 分栏。
 */
const cards = computed(() => businessCards)
</script>

<template>
  <section class="business-section" aria-label="核心业务">
    <PageContainer>
      <SectionHeading
        align="center"
        :title="businessSection.title"
      />
      <div class="business-section__grid">
        <BusinessCard
          v-for="card in cards"
          :key="card.id"
          :card="card"
        />
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.business-section {
  padding-block: var(--space-section);
  background-color: var(--color-bg-light);
}

/* 四块平铺：桌面 2×2，窄屏单列 */
.business-section__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
  margin-top: var(--space-10);
}

@media (max-width: 767px) {
  .business-section {
    padding-block: var(--space-section);
  }

  .business-section__grid {
    grid-template-columns: 1fr;
  }
}
</style>
