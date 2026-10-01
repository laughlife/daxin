<script setup lang="ts">
import { computed } from 'vue'
import { MOCK_DATA_NOTICE, mockCases } from '~/data/mock/cases'

/**
 * 首页“TRO 最新案件与进展”区域：
 * 取 Mock 数据中 isRecent 标记的最新案件展示（固定标记，避免依赖系统时间）。
 */
const recentCases = computed(() =>
  mockCases.filter(item => item.isRecent).slice(0, 3)
)
</script>

<template>
  <section class="case-preview-section" aria-label="TRO 最新案件与进展">
    <PageContainer>
      <div class="case-preview-section__head">
        <SectionHeading
          title="TRO 最新案件与进展"
          description="最新 TRO 案件动态演示。"
        />
        <NuxtLink to="/tro/cases" class="case-preview-section__all">
          进入 TRO 案件查询
          <span aria-hidden="true">→</span>
        </NuxtLink>
      </div>
      <p class="case-preview-section__notice" role="note">
        {{ MOCK_DATA_NOTICE }}以下案件号、品牌与律所均为虚构演示数据。
      </p>
      <div class="case-preview-section__grid">
        <CasePreviewCard
          v-for="record in recentCases"
          :key="record.id"
          :record="record"
        />
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.case-preview-section {
  padding-block: var(--space-16);
  background-color: var(--color-bg-page);
}

.case-preview-section__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.case-preview-section__all {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
  white-space: nowrap;
}

.case-preview-section__all:hover {
  color: var(--color-primary-dark);
}

.case-preview-section__notice {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
}

.case-preview-section__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-6);
  margin-top: var(--space-6);
}

@media (max-width: 1023px) {
  .case-preview-section__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 639px) {
  .case-preview-section {
    padding-block: var(--space-10);
  }
}
</style>
