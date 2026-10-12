<script setup lang="ts">
import { fetchBrandDetail, fetchLawFirmDetail } from '~/repositories/entities'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import { entityDirectoryHref } from '~/utils/content'
import type { CaseRecord } from '~/types/content'

/**
 * 品牌 / 律所详情。
 *
 * 通过仓储 fetchBrandDetail / fetchLawFirmDetail 读取实体与其公开案件；
 * 不存在返回 404，接口失败展示中文错误状态（不回退演示数据）。
 */
const props = defineProps<{ kind: 'brand' | 'firm'; slug: string }>()

interface EntityDetailData {
  summary: { slug: string; name: string; description: string; caseCount: number }
  cases: CaseRecord[]
}

const { data, error, refresh } = await useAsyncData<EntityDetailData | null>(
  () => `entity-detail:${props.kind}:${props.slug}`,
  async () => {
    if (props.kind === 'brand') {
      const detail = await fetchBrandDetail(props.slug)
      return detail ? { summary: detail.brand, cases: detail.cases } : null
    }
    const detail = await fetchLawFirmDetail(props.slug)
    return detail ? { summary: detail.firm, cases: detail.cases } : null
  }
)

if (!data.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: '档案不存在', fatal: true })
}

const summary = computed(() => data.value?.summary ?? null)
const cases = computed(() => data.value?.cases ?? [])
const typeLabels = computed(() => Array.from(new Set(cases.value.map(item => caseTypeLabel(item.caseType)))).join(' / '))
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '档案加载失败，请稍后重试'
)

useSeoMeta({
  title: () => `${summary.value?.name ?? '档案'} · ${props.kind === 'brand' ? '品牌历史发案' : '律所介绍'}`,
  description: () => summary.value?.description ?? ''
})
</script>

<template>
  <div class="entity-detail">
    <PageContainer>
      <nav class="entity-detail__crumb" aria-label="面包屑">
        <NuxtLink :to="kind === 'brand' ? '/brands' : '/faq/plaintiff-firms'">
          ← 返回{{ kind === 'brand' ? '侵权品牌库' : '原告律所目录' }}
        </NuxtLink>
      </nav>
      <ContentColumns group="tro">
        <ErrorState
          v-if="error"
          title="档案加载失败"
          :message="errorMessage"
          @retry="refresh"
        />

        <template v-else-if="summary">
          <header class="entity-detail__header">
            <p>{{ kind === 'brand' ? '品牌档案 · BRAND PROFILE' : '代理律所 · LAW FIRM PROFILE' }}</p>
            <h1>{{ summary.name }}</h1>
            <!-- 需求：律所有简介才显示简介，没有就只显示律所名字，
                 不显示「简介资料整理后补充」这类占位文案。 -->
            <p v-if="summary.description">{{ summary.description }}</p>
            <div class="entity-detail__stats">
              <span><strong>{{ summary.caseCount }}</strong> 条关联案件</span>
              <span v-if="typeLabels">{{ typeLabels }}</span>
            </div>
          </header>

          <section class="entity-detail__cases">
            <h2>{{ kind === 'brand' ? '该品牌历史发案' : '代理的历史案件' }}</h2>
            <article v-for="record in cases" :key="record.id">
              <div>
                <time :datetime="record.filedAt">{{ record.filedAt || '—' }}</time>
                · {{ caseTypeLabel(record.caseType) }}
              </div>
              <h3>
                <NuxtLink :to="`/tro/cases/${record.slug}`">{{ record.caseNumber }} · {{ record.plaintiffBrand }}</NuxtLink>
              </h3>
              <p>{{ record.summary }}</p>
              <p>
                原告：{{ record.plaintiffName || '—' }}
                · 代理律所：
                <NuxtLink
                  v-if="record.lawFirm"
                  :to="entityDirectoryHref('firm', record.lawFirm)"
                >
                  {{ record.lawFirm }}
                </NuxtLink>
                <span v-else>—</span>
                · 品牌：
                <NuxtLink
                  v-if="record.plaintiffBrand"
                  :to="entityDirectoryHref('brand', record.plaintiffBrand)"
                >
                  {{ record.plaintiffBrand }}
                </NuxtLink>
                <span v-else>—</span>
              </p>
              <NuxtLink :to="`/tro/cases/${record.slug}`">查看完整案件 →</NuxtLink>
            </article>

            <p v-if="!cases.length" class="entity-detail__empty" role="status">
              暂无可展示的公开案件记录。
            </p>
          </section>
        </template>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.entity-detail { padding:32px 0 64px; background:var(--color-bg-light); } .entity-detail__crumb { margin-bottom:24px; font-size:14px; } .entity-detail__header { padding:32px; border:1px solid var(--color-border); border-radius:12px; background:white; border-top:3px solid var(--color-primary); } .entity-detail__header > p:first-child { font-size:12px; color:var(--color-primary); } h1 { font-size:30px; margin:14px 0; } .entity-detail__header p { line-height:1.8; color:var(--color-text-muted); } .entity-detail__stats { display:flex; gap:24px; margin-top:24px; font-size:14px; } strong { font-size:26px; color:var(--color-primary); } .entity-detail__cases { margin-top:28px; } h2 { font-size:22px; margin-bottom:18px; } article { background:white; border:1px solid var(--color-border); border-radius:12px; padding:24px; margin-top:16px; } article div, article p { font-size:14px; color:var(--color-text-muted); line-height:1.8; } h3 { font-size:18px; margin:12px 0; } article > a { display:inline-block; margin-top:12px; font-size:14px; } .entity-detail__empty { background:white; border:1px solid var(--color-border); border-radius:12px; padding:28px; text-align:center; color:var(--color-text-muted); } @media(max-width:639px) { .entity-detail__header { padding:22px; } h1 { font-size:24px; } }
</style>
