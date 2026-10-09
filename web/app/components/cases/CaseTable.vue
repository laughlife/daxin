<script setup lang="ts">
import { entityDirectoryHref } from '~/utils/content'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import type { CaseRecord } from '~/types/content'

const { isRecent } = useContentDate()

/**
 * 案件结果表格（桌面端）。
 *
 * 固定六列，顺序为：起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型。
 * 没有起诉州 / 状态数据，因此不设这两列；案件号即详情链接。
 * 代理律所为“按此律所筛选”按钮入口（服务端关键词支持律所名）。
 */
defineProps<{
  records: CaseRecord[]
}>()

const emit = defineEmits<{
  filterByFirm: [firm: string]
}>()
</script>

<template>
  <div class="case-table__wrapper">
    <table class="case-table">
      <caption class="visually-hidden">TRO 历史案件查询结果</caption>
      <thead>
        <tr>
          <th scope="col">起诉时间</th>
          <th scope="col">案件号</th>
          <th scope="col">代理律所</th>
          <th scope="col">原告</th>
          <th scope="col">涉案品牌</th>
          <th scope="col">侵权类型</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in records" :key="record.id">
          <td class="case-table__date">{{ record.filedAt || '—' }}</td>
          <td class="case-table__number">
            <NuxtLink class="case-table__detail" :to="`/tro/cases/${record.slug}`">
              {{ record.caseNumber }}
            </NuxtLink>
            <span v-if="isRecent(record.filedAt)" class="case-table__recent">近 3 天</span>
          </td>
          <td>
            <button
              v-if="record.lawFirm"
              type="button"
              class="case-table__firm"
              :title="`按 ${record.lawFirm} 筛选`"
              @click="emit('filterByFirm', record.lawFirm)"
            >
              {{ record.lawFirm }}
            </button>
            <span v-else>—</span>
          </td>
          <td class="case-table__plaintiff">{{ record.plaintiffName || '—' }}</td>
          <td>
            <NuxtLink
              v-if="record.plaintiffBrand"
              class="case-table__brand"
              :to="entityDirectoryHref('brand', record.plaintiffBrand)"
            >
              {{ record.plaintiffBrand }}
            </NuxtLink>
            <span v-else>—</span>
          </td>
          <td>{{ caseTypeLabel(record.caseType) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.case-table__wrapper {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-page);
  box-shadow: var(--shadow-sm);
}

.case-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  min-width: 860px;
}

.case-table th,
.case-table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.case-table thead th {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-table tbody tr:hover {
  background-color: var(--color-primary-light);
}

.case-table tbody tr:last-child td {
  border-bottom: none;
}

.case-table__date {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.case-table__number {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--color-text);
}

.case-table__plaintiff {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.case-table__recent {
  margin-left: var(--space-2);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-family: var(--font-family-base);
}

.case-table__brand,
.case-table__detail {
  color: var(--color-primary);
  font-weight: 600;
}

.case-table__brand:hover,
.case-table__detail:hover {
  color: var(--color-primary-dark);
}

.case-table__firm {
  padding: 0;
  font: inherit;
  color: var(--color-text);
  border-bottom: 1px dashed var(--color-border-strong);
  transition: color var(--transition-base);
}

.case-table__firm:hover {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
</style>
