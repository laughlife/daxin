<script setup lang="ts">
const { isRecent } = useContentDate()
import { entitySlug } from '~/utils/content'
import { findArticleContent } from '~/repositories/articleContent'
import { CASE_TYPE_LABELS, MOCK_DATA_NOTICE, findMockCaseById, mockCases } from '~/data/mock/cases'

/**
 * TRO 案件详情页。
 * 按 slug / id 查找案件记录，未命中时返回 404；
 * 所有预渲染路径由 nuxt.config 的 nitro.prerender.routes 提供。
 */
const route = useRoute()

const record = findMockCaseById(String(route.params.id ?? ''))
const originalContent = findArticleContent(record?.source?.articleId)

if (!record) {
  throw createError({
    statusCode: 404,
    statusMessage: '案件不存在',
    fatal: true
  })
}

/** 同类型相关案件（“相关案件”入口，排除自身） */
const relatedCases = mockCases
  .filter(item => item.caseType === record.caseType && item.id !== record.id)
  .slice(0, 3)

useSeoMeta({
  title: `${record.plaintiffBrand} - TRO 案件详情`,
  description: `${record.caseNumber}：${record.summary}`,
  ogTitle: `${record.plaintiffBrand} - TRO 案件详情`,
  ogDescription: record.summary
})
</script>

<template>
  <div v-if="record" class="case-detail">
    <PageContainer><ContentColumns group="tro">
      <nav class="case-detail__breadcrumb" aria-label="面包屑">
        <NuxtLink to="/tro/cases">← 返回 TRO 案件查询</NuxtLink>
      </nav>

      <p class="case-detail__notice" role="note">
        {{ MOCK_DATA_NOTICE }}
      </p>

      <header class="case-detail__head">
        <div class="case-detail__badges">
          <span class="case-detail__type">{{ CASE_TYPE_LABELS[record.caseType] }}</span>
          <span v-if="isRecent(record.filedAt)" class="case-detail__recent">近 3 天更新</span>
          <span class="case-detail__status">{{ record.status }}</span>
        </div>
        <h1 class="case-detail__title">{{ record.plaintiffBrand }}</h1>
        <p class="case-detail__number">案件号：{{ record.caseNumber }}</p>
      </header>

      <dl class="case-detail__facts">
        <div>
          <dt>立案日期</dt>
          <dd>{{ record.filedAt }}</dd>
        </div>
        <div>
          <dt>代理律所</dt>
          <dd><NuxtLink :to="`/law-firms/${entitySlug(record.lawFirm)}`">{{ record.lawFirm }}</NuxtLink></dd>
        </div>
        <div>
          <dt>品牌 / 权利主体</dt><dd><NuxtLink :to="`/brands/${entitySlug(record.plaintiffBrand)}`">{{ record.plaintiffBrand }} · 历史发案</NuxtLink></dd></div><div><dt>起诉州</dt>
          <dd>{{ record.state }}</dd>
        </div>
        <div>
          <dt>案件类型</dt>
          <dd>{{ record.category }}</dd>
        </div>
        <div>
          <dt>案件状态</dt>
          <dd>{{ record.status }}</dd>
        </div>
      </dl>

      <section v-if="record.source" class="case-detail__section" aria-label="资料来源">
        <SectionHeading :level="2" title="资料来源" />
        <p v-if="record.plaintiffName" class="case-detail__summary">原告：{{ record.plaintiffName }}</p>
        <p class="case-detail__summary">《{{ record.source.title }}》 · 发布于 {{ record.source.publishedAt }} · 记录 {{ record.source.articleId }}</p>
        <NuxtLink :to="`${record.tags.includes('成功案例') ? '/tro/success-cases' : '/tro/alerts'}/legacy-${record.source.articleId}`">阅读来源文章 →</NuxtLink>
      </section>

      <section class="case-detail__section" aria-label="案件摘要">
        <SectionHeading :level="2" title="案件摘要" />
        <p class="case-detail__summary">{{ record.summary }}</p>
        <ul class="case-detail__tags">
          <li v-for="tag in record.tags" :key="tag">{{ tag }}</li>
        </ul>
      </section>

      <section
        v-if="originalContent"
        class="case-detail__section"
        aria-label="来源文章原文"
      >
        <SectionHeading :level="2" title="来源文章原文与配图" description="保留文章原有排版与图片；同一篇报道可能包含多起案件。" />
        <RichArticleBody :content="originalContent" />
      </section>

      <section
        v-if="relatedCases.length"
        class="case-detail__section"
        aria-label="相关案件"
      >
        <SectionHeading :level="2" title="同类型相关案件" />
        <ul class="case-detail__related">
          <li v-for="item in relatedCases" :key="item.id">
            <NuxtLink :to="`/tro/cases/${item.slug}`">
              {{ item.plaintiffBrand }}
              <span class="case-detail__related-meta">
                {{ item.caseNumber }} · {{ item.state }} · {{ item.status }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <div class="case-detail__actions">
        <BaseButton to="/tro/cases" variant="secondary">返回案件列表</BaseButton>
        <BaseButton to="/" variant="ghost">回到首页</BaseButton>
      </div>
    </ContentColumns></PageContainer>
  </div>
</template>

<style scoped>
.case-detail {
  padding-block: var(--space-8) var(--space-16);
  background-color: var(--color-bg-light);
  min-height: 60vh;
}

.case-detail__breadcrumb {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}

.case-detail__notice {
  margin-bottom: var(--space-4);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
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

.case-detail__status {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
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
