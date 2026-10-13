<script setup lang="ts">
import { fetchCaseDetail, fetchCases } from '~/repositories/cases'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import { entityDirectoryHref } from '~/utils/content'
import type { CaseRecord } from '~/types/content'

const { isRecent } = useContentDate()

/**
 * TRO 案件详情页。
 * 通过仓储 fetchCaseDetail(slug) 读取真实数据；未命中返回 404，接口失败展示错误状态。
 * 相关案件取同一原告品牌的历史案件（服务端关键词覆盖品牌名）。
 */
const route = useRoute()
const slug = String(route.params.id ?? '')

const { data, error, refresh } = await useAsyncData(
  () => `tro-case:${slug}`,
  async () => {
    const record = await fetchCaseDetail(slug)
    if (!record) return null
    let related: CaseRecord[] = []
    if (record.plaintiffBrand) {
      try {
        const page = await fetchCases({ keyword: record.plaintiffBrand, pageSize: 4 })
        related = page.items.filter(item => item.id !== record.id).slice(0, 3)
      } catch {
        // 相关案件属于附加信息，失败不影响详情展示。
        related = []
      }
    }
    return { record, related }
  }
)

if (!data.value && !error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: '案件不存在',
    fatal: true
  })
}

const record = computed(() => data.value?.record ?? null)
const relatedCases = computed(() => data.value?.related ?? [])
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '案件详情加载失败，请稍后重试'
)

useSeoMeta({
  title: () => record.value ? `${record.value.plaintiffBrand || record.value.caseNumber} - TRO 案件详情` : 'TRO 案件详情',
  description: () => record.value ? `${record.value.caseNumber}：${record.value.summary}` : 'TRO 案件详情',
  ogTitle: () => record.value ? `${record.value.plaintiffBrand || record.value.caseNumber} - TRO 案件详情` : 'TRO 案件详情',
  ogDescription: () => record.value?.summary ?? ''
})
</script>

<template>
  <div class="case-detail">
    <PageContainer><ContentColumns group="tro">
      <nav class="case-detail__breadcrumb" aria-label="面包屑">
        <NuxtLink to="/tro/cases">← 返回 TRO 案件查询</NuxtLink>
      </nav>

      <ErrorState
        v-if="error"
        title="案件详情加载失败"
        :message="errorMessage"
        @retry="refresh"
      />

      <template v-else-if="record">
        <header class="case-detail__head">
          <div class="case-detail__badges">
            <span class="case-detail__type">{{ caseTypeLabel(record.caseType) }}</span>
            <span v-if="isRecent(record.filedAt)" class="case-detail__recent">近 3 天更新</span>
          </div>
          <h1 class="case-detail__title">{{ record.plaintiffBrand || record.caseNumber }}</h1>
          <p class="case-detail__number">案件号：{{ record.caseNumber || '—' }}</p>
        </header>

        <dl class="case-detail__facts">
          <div>
            <dt>起诉时间</dt>
            <dd>{{ record.filedAt || '—' }}</dd>
          </div>
          <div>
            <dt>代理律所</dt>
            <dd>
              <NuxtLink
                v-if="record.lawFirm"
                :to="entityDirectoryHref('firm', record.lawFirm)"
              >
                {{ record.lawFirm }}
              </NuxtLink>
              <span v-else>—</span>
            </dd>
          </div>
          <div>
            <dt>原告</dt>
            <dd>{{ record.plaintiffName || '—' }}</dd>
          </div>
          <div>
            <dt>涉案品牌</dt>
            <dd>
              <NuxtLink
                v-if="record.plaintiffBrand"
                :to="entityDirectoryHref('brand', record.plaintiffBrand)"
              >
                {{ record.plaintiffBrand }} · 历史发案
              </NuxtLink>
              <span v-else>—</span>
            </dd>
          </div>
          <div>
            <dt>侵权类型</dt>
            <dd>{{ caseTypeLabel(record.caseType) }}</dd>
          </div>
        </dl>

        <section v-if="record.source" class="case-detail__section" aria-label="资料来源">
          <SectionHeading :level="2" title="资料来源" />
          <p class="case-detail__summary">《{{ record.source.title }}》 · 发布于 {{ record.source.publishedAt || '—' }}</p>
          <p v-if="record.source.excerpt" class="case-detail__summary">{{ record.source.excerpt }}</p>
        </section>

        <section v-if="record.summary" class="case-detail__section" aria-label="案件摘要">
          <SectionHeading :level="2" title="案件摘要" />
          <p class="case-detail__summary">{{ record.summary }}</p>
          <ul v-if="record.tags.length" class="case-detail__tags">
            <li v-for="tag in record.tags" :key="tag">{{ tag }}</li>
          </ul>
        </section>

        <section
          v-if="relatedCases.length"
          class="case-detail__section"
          aria-label="相关案件"
        >
          <SectionHeading :level="2" title="同品牌相关案件" />
          <ul class="case-detail__related">
            <li v-for="item in relatedCases" :key="item.id">
              <NuxtLink :to="`/tro/cases/${item.slug}`">
                {{ item.caseNumber }}
                <span class="case-detail__related-meta">
                  {{ item.filedAt }} · {{ caseTypeLabel(item.caseType) }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <div class="case-detail__actions">
          <BaseButton to="/tro/cases" variant="secondary">返回案件列表</BaseButton>
          <BaseButton to="/" variant="ghost">回到首页</BaseButton>
        </div>
      </template>
    </ContentColumns></PageContainer>
  </div>
</template>

<style scoped>
.case-detail {
  padding-block: var(--space-section-compact) var(--space-section);
  background-color: var(--color-bg-light);
  min-height: 60vh;
}

.case-detail__breadcrumb {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}

.case-detail__head {
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.case-detail__badges {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.case-detail__type {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-detail__recent {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-weight: 600;
}

.case-detail__title {
  font-size: var(--text-3xl);
  color: var(--color-text);
}

.case-detail__number {
  margin-top: var(--space-2);
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.case-detail__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  margin: var(--space-6) 0 0;
  padding: var(--space-5);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.case-detail__facts dt {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.case-detail__facts dd {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text);
}

.case-detail__section {
  margin-top: var(--space-8);
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.case-detail__summary {
  margin-top: var(--space-3);
  color: var(--color-text);
  line-height: var(--leading-relaxed);
}

.case-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.case-detail__tags li {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.case-detail__related {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.case-detail__related a {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.case-detail__related a:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  text-decoration: none;
}

.case-detail__related-meta {
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.case-detail__actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-8);
}
</style>
