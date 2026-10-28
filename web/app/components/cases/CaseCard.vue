<script setup lang="ts">
import { entityDirectoryHref } from '~/utils/content'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import type { CaseRecord } from '~/types/content'

const { isRecent } = useContentDate()

/**
 * 案件卡片（移动端列表使用）。
 * 展示与桌面表格一致的六项信息；没有起诉州 / 状态数据，不再展示这两项。
 * 品牌为目录页入口，律所为“按此律所筛选”按钮入口。
 */
defineProps<{
  record: CaseRecord
}>()

const emit = defineEmits<{
  filterByFirm: [firm: string]
}>()
</script>

<template>
  <article class="case-card">
    <div class="case-card__head">
      <span class="case-card__type">{{ caseTypeLabel(record.caseType) }}</span>
      <span v-if="isRecent(record.filedAt)" class="case-card__recent">近 3 天更新</span>
    </div>
    <h3 class="case-card__brand">
      <NuxtLink
        v-if="record.plaintiffBrand"
        :to="entityDirectoryHref('brand', record.plaintiffBrand)"
      >
        {{ record.plaintiffBrand }}
      </NuxtLink>
      <span v-else>品牌待确认</span>
    </h3>
    <p class="case-card__number">案件号：{{ record.caseNumber || '—' }}</p>
    <dl class="case-card__meta">
      <div>
        <dt>起诉时间</dt>
        <dd>{{ record.filedAt || '—' }}</dd>
      </div>
      <div>
        <dt>原告</dt>
        <dd>{{ record.plaintiffName || '—' }}</dd>
      </div>
      <div>
        <dt>代理律所</dt>
        <dd>
          <button
            v-if="record.lawFirm"
            type="button"
            class="case-card__firm"
            @click="emit('filterByFirm', record.lawFirm)"
          >
            {{ record.lawFirm }}
          </button>
          <span v-else>—</span>
        </dd>
      </div>
    </dl>
    <NuxtLink class="case-card__detail" :to="`/tro/cases/${record.slug}`">
      查看案件详情
      <span aria-hidden="true">→</span>
    </NuxtLink>
  </article>
</template>

<style scoped>
.case-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.case-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.case-card__type {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-card__recent {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-card__brand {
  font-size: var(--text-base);
}

.case-card__brand a {
  color: var(--color-text);
}

.case-card__brand a:hover {
  color: var(--color-primary);
}

.case-card__number {
  font-size: var(--text-xs);
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--color-text-muted);
}

.case-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  margin: 0;
  font-size: var(--text-xs);
}

.case-card__meta div {
  display: flex;
  gap: var(--space-1);
  min-width: 0;
}

.case-card__meta dt {
  color: var(--color-text-muted);
}

.case-card__meta dd {
  margin: 0;
  color: var(--color-text);
}

.case-card__firm {
  padding: 0;
  font: inherit;
  font-size: var(--text-xs);
  color: var(--color-text);
}

.case-card__firm:hover {
  color: var(--color-primary);
}

.case-card__detail {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}
</style>
