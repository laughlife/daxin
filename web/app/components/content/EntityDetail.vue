<script setup lang="ts">
import { fetchBrandDetail, fetchLawFirmDetail } from '~/repositories/entities'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import { entityDirectoryHref } from '~/utils/content'
import type { CaseRecord } from '~/types/content'

/**
 * 品牌 / 律所详情。
 *
 * 品牌页（2026-10-28 改版）：封面 + 资料（分类 / 品牌方 / 原告 / 代理律所 / 起诉州 / 关联案件）
 * + 小程序采集的富文本介绍 + 品牌图片；**不再展示历史发案**。
 * 律所页保持原样：简介 + 类型徽标 + 该律所代理的历史案件。
 *
 * 通过仓储 fetchBrandDetail / fetchLawFirmDetail 读取数据；不存在返回 404，
 * 接口失败展示中文错误状态（不回退演示数据）。
 */
const props = defineProps<{ kind: 'brand' | 'firm'; slug: string }>()

interface EntitySummaryData {
  slug: string
  name: string
  description: string
  caseCount: number
  ipCategory?: string
  brandOwner?: string
  lawsuitType?: string
  plaintiff?: string
  lawFirm?: string
  stateCode?: string
  coverUrl?: string
  intro?: string
  images?: string[]
}

interface EntityDetailData {
  summary: EntitySummaryData
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

/** 律所页的类型徽标仍按历史案件的侵权类型汇总。 */
const typeLabels = computed(() => Array.from(new Set(cases.value.map(item => caseTypeLabel(item.caseType)))).join(' / '))
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '档案加载失败，请稍后重试'
)

/* ------------------------------- 品牌资料 ------------------------------- */

const coverFailed = ref(false)

const brandImages = computed(() => summary.value?.images ?? [])
/** 封面优先用 brands.cover_url，没有就用第一张品牌图。 */
const brandCover = computed(() => summary.value?.coverUrl || brandImages.value[0] || '')

const brandFacts = computed(() => {
  const item = summary.value
  if (!item) return []
  return [
    { label: '品牌分类', value: item.ipCategory || item.lawsuitType || '' },
    { label: '品牌方', value: item.brandOwner || '' },
    { label: '品牌原告', value: item.plaintiff || '' },
    { label: '代理律所', value: item.lawFirm || '' },
    { label: '起诉州', value: item.stateCode || '' },
    { label: '关联案件', value: item.caseCount > 0 ? `${item.caseCount} 起` : '暂无公开案件' },
  ].filter(fact => fact.value)
})

/** 首屏最多展示 12 张，其余点「显示全部」再渲染，避免一次拉 70+ 张大图。 */
const IMAGE_PREVIEW_LIMIT = 12
const showAllImages = ref(false)
const visibleImages = computed(() => (
  showAllImages.value ? brandImages.value : brandImages.value.slice(0, IMAGE_PREVIEW_LIMIT)
))

// 切换品牌（同一组件复用时）重置图片展开与封面失败状态。
watch(() => props.slug, () => {
  showAllImages.value = false
  coverFailed.value = false
})

function brandInitial(name: string): string {
  return Array.from(name.trim())[0] || 'B'
}

/** 详情页 meta description：没有简介摘要时退到介绍正文的纯文本。 */
function plainText(html?: string): string {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

useSeoMeta({
  title: () => `${summary.value?.name ?? '档案'} · ${props.kind === 'brand' ? '品牌档案' : '律所介绍'}`,
  description: () => summary.value?.description || plainText(summary.value?.intro)
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
          <!-- 品牌：封面 + 资料 + 介绍 + 图片；不展示历史发案 -->
          <template v-if="kind === 'brand'">
            <header class="entity-detail__profile">
              <div class="entity-detail__cover" :class="{ 'is-placeholder': !brandCover || coverFailed }">
                <img
                  v-if="brandCover && !coverFailed"
                  :src="brandCover"
                  :alt="`${summary.name} 品牌图片`"
                  decoding="async"
                  @error="coverFailed = true"
                >
                <span v-else aria-hidden="true">{{ brandInitial(summary.name) }}</span>
              </div>
              <div class="entity-detail__headline">
                <p class="entity-detail__eyebrow">品牌档案 · BRAND PROFILE</p>
                <h1>{{ summary.name }}</h1>
                <dl v-if="brandFacts.length" class="entity-detail__facts">
                  <div v-for="fact in brandFacts" :key="fact.label">
                    <dt>{{ fact.label }}</dt>
                    <dd>{{ fact.value }}</dd>
                  </div>
                </dl>
              </div>
            </header>

            <section v-if="summary.intro" class="entity-detail__section">
              <h2>品牌介绍</h2>
              <!-- intro 已在服务端按白名单清洗（toSafeRichText），这里只做排版 -->
              <div class="entity-detail__rich" v-html="summary.intro" />
            </section>

            <section v-if="brandImages.length" class="entity-detail__section">
              <h2>品牌图片</h2>
              <div class="entity-detail__gallery">
                <a
                  v-for="(image, index) in visibleImages"
                  :key="image"
                  :href="image"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    :src="image"
                    :alt="`${summary.name} 品牌图片 ${index + 1}`"
                    loading="lazy"
                    decoding="async"
                  >
                </a>
              </div>
              <button
                v-if="!showAllImages && brandImages.length > visibleImages.length"
                type="button"
                class="entity-detail__more"
                @click="showAllImages = true"
              >
                显示全部 {{ brandImages.length }} 张
              </button>
            </section>
          </template>

          <!-- 律所：保持原有简介 + 历史案件 -->
          <template v-else>
            <header class="entity-detail__header">
              <p>代理律所 · LAW FIRM PROFILE</p>
              <h1>{{ summary.name }}</h1>
              <!-- 需求：律所有简介才显示简介，没有就只显示律所名字，
                   不显示「简介资料整理后补充」这类占位文案。 -->
              <p v-if="summary.description">{{ summary.description }}</p>
              <div class="entity-detail__stats">
                <span class="entity-detail__case-count"><strong>{{ summary.caseCount }}</strong><span>条关联案件</span></span>
                <span v-if="typeLabels" class="entity-detail__type-badge">{{ typeLabels }}</span>
              </div>
            </header>

            <section class="entity-detail__cases">
              <h2>代理的历史案件</h2>
              <article v-for="record in cases" :key="record.id">
                <div>
                  <time :datetime="record.filedAt">{{ record.filedAt || '—' }}</time>
                  · {{ caseTypeLabel(record.caseType) }}
                </div>
                <h3>
                  <NuxtLink :to="`/tro/cases/${record.slug}`">{{ record.caseNumber }} · {{ record.plaintiffBrand }}</NuxtLink>
                </h3>
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
              </article>

              <p v-if="!cases.length" class="entity-detail__empty" role="status">
                暂无可展示的公开案件记录。
              </p>
            </section>
          </template>
        </template>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.entity-detail { padding-block:var(--space-section-compact) var(--space-section); background:var(--color-bg-light); }
.entity-detail__crumb { margin-bottom:var(--space-6); color:var(--color-text-muted); font-size:var(--text-sm); }

/* 品牌资料卡：左侧封面，右侧名称与字段 */
.entity-detail__profile { display:grid; grid-template-columns:200px minmax(0,1fr); gap:var(--space-8); padding:var(--space-8); border:1px solid var(--color-border); border-top:3px solid var(--color-primary); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.entity-detail__cover { display:grid; width:100%; aspect-ratio:1; place-items:center; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-md); background:#f6f7f9; }
.entity-detail__cover img { width:100%; height:100%; object-fit:contain; }
.entity-detail__cover.is-placeholder span { color:var(--color-primary); font-size:3rem; font-weight:750; }
.entity-detail__headline { min-width:0; }
.entity-detail__eyebrow { color:var(--color-primary); font-size:var(--text-xs); font-weight:700; letter-spacing:.1em; }
/* 品牌名可能很长（最长 57 字），标题比其它页面小一号，避免占满整屏 */
.entity-detail__headline h1 { margin:var(--space-3) 0 var(--space-5); font-size:clamp(20px, 2.2vw, 28px); line-height:1.4; overflow-wrap:anywhere; }
.entity-detail__facts { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:var(--space-3) var(--space-5); margin:0; }
.entity-detail__facts > div { display:grid; gap:2px; min-width:0; padding-left:var(--space-3); border-left:2px solid color-mix(in srgb, var(--color-primary) 28%, transparent); }
.entity-detail__facts dt { color:var(--color-text-muted); font-size:var(--text-xs); }
.entity-detail__facts dd { margin:0; overflow-wrap:anywhere; color:var(--color-text); font-size:var(--text-sm); line-height:1.5; }

.entity-detail__section { margin-top:var(--space-8); padding:var(--space-8); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); }
.entity-detail__section h2 { margin-bottom:var(--space-4); font-size:var(--heading-3); }
.entity-detail__rich { color:var(--color-text-muted); font-size:var(--text-sm); line-height:var(--leading-relaxed); overflow-wrap:anywhere; }
.entity-detail__rich :deep(p) { margin:0 0 var(--space-3); }
.entity-detail__rich :deep(p:last-child) { margin-bottom:0; }
.entity-detail__rich :deep(img) { max-width:100%; height:auto; border-radius:var(--radius-sm); }
.entity-detail__rich :deep(a) { color:var(--color-primary); word-break:break-all; }
.entity-detail__rich :deep(ul), .entity-detail__rich :deep(ol) { margin:0 0 var(--space-3); padding-left:1.4em; }
.entity-detail__rich :deep(table) { width:100%; border-collapse:collapse; }
.entity-detail__rich :deep(td), .entity-detail__rich :deep(th) { padding:var(--space-2); border:1px solid var(--color-border); }

.entity-detail__gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:var(--space-3); }
.entity-detail__gallery a { display:block; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-md); background:#f6f7f9; }
.entity-detail__gallery img { display:block; width:100%; aspect-ratio:1; object-fit:cover; transition:transform var(--transition-base); }
.entity-detail__gallery a:hover img { transform:scale(1.03); }
.entity-detail__more { margin-top:var(--space-4); padding:var(--space-2) var(--space-4); border:1px solid var(--color-border-strong); border-radius:var(--radius-full); background:var(--color-bg-page); color:var(--color-primary); font:inherit; font-size:var(--text-sm); cursor:pointer; }
.entity-detail__more:hover { border-color:var(--color-primary); }

/* 律所详情沿用的样式 */
.entity-detail__header { padding:var(--space-8); border:1px solid var(--color-border); border-top:3px solid var(--color-primary); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
.entity-detail__header > p:first-child { color:var(--color-primary); font-size:var(--text-xs); font-weight:700; letter-spacing:.1em; }
.entity-detail__header h1 { margin:var(--space-4) 0; font-size:clamp(20px, 2.2vw, 28px); line-height:1.4; overflow-wrap:anywhere; }
.entity-detail__header p { color:var(--color-text-muted); line-height:var(--leading-relaxed); }
.entity-detail__stats { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-3); margin-top:var(--space-6); color:var(--color-text-muted); font-size:var(--text-sm); }
.entity-detail__case-count { display:inline-flex; align-items:baseline; gap:var(--space-2); }
.entity-detail__case-count > span { line-height:1.3; }
.entity-detail__type-badge { display:inline-flex; align-items:center; min-height:28px; padding:var(--space-1) var(--space-3); border:1px solid var(--color-border); border-radius:var(--radius-full); background:var(--color-bg-light); color:var(--color-primary); font-size:var(--text-xs); font-weight:600; line-height:1.3; }
.entity-detail__header strong, .entity-detail__case-count strong { color:var(--color-primary); font-size:var(--text-2xl); }
.entity-detail__cases { margin-top:var(--space-8); }
.entity-detail__cases h2 { margin-bottom:var(--space-5); font-size:var(--heading-2); }
.entity-detail__cases article { margin-top:var(--space-4); padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); }
.entity-detail__cases article div, .entity-detail__cases article p { color:var(--color-text-muted); font-size:var(--text-sm); line-height:var(--leading-relaxed); }
.entity-detail__cases h3 { margin:var(--space-3) 0; font-size:var(--text-xl); }
.entity-detail__empty { padding:var(--space-8); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); color:var(--color-text-muted); text-align:center; }

@media(max-width:767px) {
  .entity-detail__profile { grid-template-columns:1fr; gap:var(--space-5); padding:var(--space-5); }
  .entity-detail__cover { max-width:220px; }
  .entity-detail__section { padding:var(--space-5); }
  .entity-detail__header { padding:var(--space-5); }
}
@media(max-width:639px) {
  .entity-detail__gallery { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
</style>
