<script setup lang="ts">
import type { CaseRecord } from '~/types/content'
import { CASE_TYPE_LABELS } from '~/data/mock/cases'

/**
 * 首页 TRO 案件预览卡片：展示 Mock 案件的关键字段，
 * isRecent 显示“近 3 天更新”徽标（固定 Mock 标记，不依赖系统时间）。
 * 点击整卡进入案件详情（/tro/cases/[id]）。
 */
defineProps<{
  record: CaseRecord
}>()
</script>

<template>
  <article class="case-preview-card">
    <div class="case-preview-card__head">
      <span class="case-preview-card__type">
        {{ CASE_TYPE_LABELS[record.caseType] }}
      </span>
      <span v-if="record.isRecent" class="case-preview-card__recent">近 3 天更新</span>
    </div>
    <h3 class="case-preview-card__brand">
      <NuxtLink :to="`/tro/cases/${record.slug}`">{{ record.plaintiffBrand }}</NuxtLink>
    </h3>
    <p class="case-preview-card__summary">{{ record.summary }}</p>
    <dl class="case-preview-card__meta">
      <div>
        <dt>案件号</dt>
        <dd>{{ record.caseNumber }}</dd>
      </div>
      <div>
        <dt>起诉州</dt>
        <dd>{{ record.state }}</dd>
      </div>
      <div>
        <dt>状态</dt>
        <dd>{{ record.status }}</dd>
      </div>
      <div>
        <dt>立案日期</dt>
        <dd>{{ record.filedAt }}</dd>
      </div>
    </dl>
    <NuxtLink :to="`/tro/cases/${record.slug}`" class="case-preview-card__more">
      查看案件详情
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </article>
</template>

<style scoped>
.case-preview-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-5);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.case-preview-card:hover,
.case-preview-card:focus-within {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.case-preview-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.case-preview-card__type {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-preview-card__recent {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-preview-card__brand {
  font-size: var(--text-lg);
}

.case-preview-card__brand a {
  color: var(--color-text);
}

.case-preview-card__brand a:hover {
  color: var(--color-primary);
}

.case-preview-card__summary {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.case-preview-card__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  font-size: var(--text-xs);
}

.case-preview-card__meta div {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}

.case-preview-card__meta dt {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.case-preview-card__meta dd {
  margin: 0;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-preview-card__more {
  margin-top: auto;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.case-preview-card__more:hover {
  color: var(--color-primary-dark);
}
</style>
