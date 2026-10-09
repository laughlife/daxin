<script setup lang="ts">
import { mockBrands, mockFirms } from '~/data/mock/entities'
import type { CaseType } from '~/types/content'
import { CASE_TYPE_LABELS } from '~/data/mock/cases'
import { inDateRange } from '~/utils/content'
const props = defineProps<{ kind: 'brand' | 'firm' }>()
// 按品牌去重统计；一个品牌可同时涉及多个类型，各类型数量可能重叠。
const brandStats = [
  { label: '收录品牌', count: mockBrands.length },
  ...(['trademark', 'patent', 'copyright'] as CaseType[]).map(type => ({
    label: `${CASE_TYPE_LABELS[type]}类品牌`, count: mockBrands.filter(brand => brand.types.includes(type)).length
  }))
]
const keyword = ref('')
const type = ref('')
const from = ref('')
const to = ref('')
const title = computed(() => props.kind === 'brand' ? '侵权品牌库' : 'TRO 原告律所')
const entities = computed(() => (props.kind === 'brand' ? mockBrands : mockFirms).filter(item => {
  const cases = item.cases.filter(record => (!type.value || record.caseType === type.value) && inDateRange(record.filedAt, from.value, to.value))
  return cases.some(record => `${record.caseNumber} ${record.plaintiffBrand} ${record.lawFirm}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))
}))
useSeoMeta({ title: () => title.value, description: '按案件号、品牌、律所、案件类型和立案日期检索案件资料。' })
</script>
<template><div class="directory"><PageContainer><SectionHeading :level="1" :title="title" :description="kind === 'brand' ? '按商标、专利、版权检索品牌，查看品牌历史发案。' : '查看原告代理律所介绍、案件类型与历史案件。'" /><ContentColumns group="tro"><ContentSectionTabs v-if="kind === 'firm'" path="/faq/plaintiff-firms" /><section v-if="kind === 'brand'" class="directory__stats" aria-label="品牌统计"><h2>品牌统计</h2><div class="directory__stats-grid"><div v-for="stat in brandStats" :key="stat.label"><strong>{{ stat.count }}</strong><span>{{ stat.label }}</span></div></div><p>统计本次收录的品牌及权利主体，按品牌去重；多类型品牌分别计入对应分类。筛选结果数量见下方列表。</p></section><form class="directory__search" role="search" @submit.prevent><label>关键词<input v-model="keyword" type="search" placeholder="案件号、品牌名、律所名"></label><label>案件类型<select v-model="type"><option value="">全部类型</option><option v-for="(label, key) in CASE_TYPE_LABELS" :key="key" :value="key">{{ label }}</option></select></label><label>立案日期从<input v-model="from" type="date"></label><label>立案日期至<input v-model="to" type="date"></label></form><p class="directory__notice">共 {{ entities.length }} {{ kind === 'brand' ? '个品牌' : '家律所' }} · 公开案件资料</p><p v-if="from && to && from > to" role="alert">开始日期不能晚于结束日期。</p><div class="directory__grid"><article v-for="item in entities" :key="item.slug" class="directory__card"><p class="directory__label">{{ kind === 'brand' ? '品牌档案' : '律所档案' }}</p><h2><NuxtLink :to="`${kind === 'brand' ? '/brands' : '/law-firms'}/${item.slug}`">{{ item.name }}</NuxtLink></h2><p>{{ item.description }}</p><p class="directory__count">{{ item.cases.length }} 条关联案件 · {{ Array.from(new Set(item.cases.map(record => CASE_TYPE_LABELS[record.caseType]))).join(' / ') }}</p><NuxtLink :to="`${kind === 'brand' ? '/brands' : '/law-firms'}/${item.slug}`">查看{{ kind === 'brand' ? '品牌历史发案' : '律所介绍与案件' }} →</NuxtLink></article></div><p v-if="!entities.length" class="directory__notice" role="status">未找到匹配资料，请调整关键词或筛选条件。</p></ContentColumns></PageContainer></div></template>
<style scoped>
.directory { padding:40px 0 64px; background:var(--color-bg-light); } .directory :deep(.content-columns) { margin-top:28px; }
.directory__stats { padding:20px; margin-bottom:20px; border:1px solid var(--color-border); border-radius:12px; background:white; }
.directory__stats h2 { font-size:18px; margin-bottom:16px; }
.directory__stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.directory__stats-grid > div { display:flex; flex-direction:column; gap:6px; padding:12px; text-align:center; background:var(--color-bg-light); border-radius:8px; }
.directory__stats-grid strong { font-size:28px; color:var(--color-primary); }
.directory__stats-grid span { font-size:13px; color:var(--color-text-muted); }
.directory__stats > p { font-size:12px; color:var(--color-text-muted); margin-top:14px; line-height:1.7; }
.directory__search { display:grid; grid-template-columns:2fr 1fr; gap:14px; padding:20px; background:white; border-radius:12px; border:1px solid var(--color-border); }
label { display:flex; flex-direction:column; gap:6px; font-size:13px; min-width:0; } input,select { width:100%; min-width:0; padding:10px; border:1px solid var(--color-border); border-radius:6px; font:inherit; background:white; }
.directory__notice { font-size:13px; color:var(--color-text-muted); margin:18px 0; } .directory__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.directory__card { background:white; border:1px solid var(--color-border); border-radius:12px; padding:24px; } .directory__label { color:var(--color-primary); font-size:12px; margin-bottom:12px; } h2 { font-size:20px; margin-bottom:12px; } h2 a { color:var(--color-text); } .directory__card > p:not(:first-child) { font-size:14px; color:var(--color-text-muted); line-height:1.8; } .directory__count { margin:14px 0; } .directory__card > a { font-size:14px; }
@media(max-width:639px) { .directory__stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .directory__grid { grid-template-columns:1fr; } .directory__search { grid-template-columns:1fr; } }
</style>

