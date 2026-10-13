<script setup lang="ts">
import type { CaseRecord } from '~/types/content'

/**
 * 首页“TRO 最新案件与进展”区域。
 * 案件数据由首页 useAsyncData 调用 fetchHomeData() 取得后传入（最多 6 条）。
 */
const props = defineProps<{
  cases: CaseRecord[]
}>()

const { today, isRecent } = useContentDate()

const recentCases = computed(() =>
  props.cases.filter(item => isRecent(item.filedAt))
)
const visibleCases = computed(() => recentCases.value.length ? recentCases.value : props.cases)
</script>

<template>
  <section class="case-preview-section" aria-label="TRO 最新案件与进展">
    <PageContainer>
      <div class="case-preview-section__head">
        <SectionHeading
          :title="recentCases.length ? '近三天 TRO 案件与进展' : '精选历史 TRO 案件'"
          :description="recentCases.length ? `北京时间 ${today} 及前两天的立案动态` : '精选历史案件，按原始起诉时间排序。'"
        />
        <NuxtLink to="/tro/cases" class="case-preview-section__all">
          进入 TRO 案件查询
          <span aria-hidden="true">→</span>
        </NuxtLink>
      </div>
      <p v-if="!recentCases.length && cases.length" class="case-preview-section__notice" role="status">近三天暂无案件记录，以下为历史案件资料。</p>
      <p v-if="!cases.length" class="case-preview-section__notice" role="status">暂无可展示的案件记录，可进入案件查询查看公开资料。</p>
      <div class="case-preview-section__grid">
        <CasePreviewCard
          v-for="record in visibleCases"
          :key="record.id"
          :record="record"
        />
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.case-preview-section {
  padding-block: var(--space-section);
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
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
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
    padding-block: var(--space-section);
  }
}
</style>
