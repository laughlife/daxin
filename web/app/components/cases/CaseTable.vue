<script setup lang="ts">
import { CASE_TYPE_LABELS } from '~/data/mock/cases'
import type { CaseRecord } from '~/types/content'

/**
 * 案件结果表格（桌面端）。
 * - 原告品牌为详情链接入口；
 * - 代理律所为“按此律所筛选”按钮入口（律所落地页未实现，点击即应用筛选）；
 * - isRecent 行显示“近 3 天更新”徽标（固定 Mock 标记）。
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
      <caption class="visually-hidden">TRO 案件查询结果（Mock 演示数据）</caption>
      <thead>
        <tr>
          <th scope="col">案件号</th>
          <th scope="col">原告品牌</th>
          <th scope="col">代理律所</th>
          <th scope="col">类型</th>
          <th scope="col">起诉州</th>
          <th scope="col">立案日期</th>
          <th scope="col">状态</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in records" :key="record.id">
          <td class="case-table__number">
            {{ record.caseNumber }}
            <span v-if="record.isRecent" class="case-table__recent">近 3 天</span>
          </td>
          <td>
            <NuxtLink
              class="case-table__brand"
              :to="`/tro/cases/${record.slug}`"
            >
              {{ record.plaintiffBrand }}
            </NuxtLink>
          </td>
          <td>
            <button
              type="button"
              class="case-table__firm"
              :title="`按 ${record.lawFirm} 筛选（律所专页尚未实现）`"
              @click="emit('filterByFirm', record.lawFirm)"
            >
              {{ record.lawFirm }}
            </button>
          </td>
          <td>{{ CASE_TYPE_LABELS[record.caseType] }}</td>
          <td>{{ record.state }}</td>
          <td>{{ record.filedAt }}</td>
          <td>
            <span class="case-table__status">{{ record.status }}</span>
          </td>
          <td>
            <NuxtLink class="case-table__detail" :to="`/tro/cases/${record.slug}`">
              详情
            </NuxtLink>
          </td>
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

.case-table__number {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: var(--color-text);
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
  color: var(--color-text);
  border-bottom: 1px dashed var(--color-border-strong);
  transition: color var(--transition-base);
}

.case-table__firm:hover {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.case-table__status {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
</style>
