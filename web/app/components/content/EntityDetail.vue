<script setup lang="ts">
import { fetchBrandDetail, fetchLawFirmDetail } from '~/repositories/entities'
import type { BrandHistoryCase } from '~/repositories/entities'
import { caseTypeLabel } from '~/utils/caseTypeLabel'
import { externalUrlLabel, safeExternalUrl } from '~/utils/content'
import type { CaseRecord } from '~/types/content'

/**
 * 品牌 / 律所详情。
 *
 * 品牌页：封面 + 资料（分类 / 品牌方 / 原告 / 代理律所 / 起诉州 / 关联案件）
 * + 小程序采集的富文本介绍 + 品牌图片。
 *
 * 律所页：纯文字档案——名称 + 资料（简称 / 地址 / 官网 / 侵权类型 / 关联案件）+ 律所介绍，
 * 不保留图片位置。
 *
 * 两类详情都只做档案展示，不再嵌入历史案件列表（案件数仍作为字段展示）。
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
  logoUrl?: string
  shortName?: string
  address?: string
  website?: string
  intro?: string
  images?: string[]
  historyCases?: BrandHistoryCase[]
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
/** 品牌历史发案（小程序「起诉信息」原样展示，接口已按起诉时间倒序）。 */
const historyCases = computed<BrandHistoryCase[]>(() => summary.value?.historyCases ?? [])

/** 律所页的类型徽标仍按历史案件的侵权类型汇总。 */
const typeLabels = computed(() => Array.from(new Set(cases.value.map(item => caseTypeLabel(item.caseType)))).join(' / '))
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '档案加载失败，请稍后重试'
)

/* ------------------------------- 品牌资料 ------------------------------- */

const allBrandImages = computed(() => summary.value?.images ?? [])
/** 品牌页不再单独放通栏图：封面并入下方「品牌图片」画廊，排在第一张。 */
const brandImages = computed(() => {
  const cover = summary.value?.coverUrl || allBrandImages.value[0] || ''
  const rest = allBrandImages.value.filter(url => url && url !== cover)
  return cover ? [cover, ...rest] : rest
})

/** 品牌资料：原告与品牌方统一成一个「品牌方」字段，不再区分原告。 */
const brandFacts = computed(() => {
  const item = summary.value
  if (!item) return []
  return [
    // 顺序即版式：短字段两两成排，较长的名称整行放在下面。
    { label: '品牌分类', value: item.ipCategory || item.lawsuitType || '', wide: false },
    { label: '起诉州', value: item.stateCode || '', wide: false },
    { label: '代理律所', value: item.lawFirm || '', wide: false },
    { label: '关联案件', value: item.caseCount > 0 ? `${item.caseCount} 起` : '暂无公开案件', wide: false },
    { label: '品牌方', value: item.brandOwner || item.plaintiff || '', wide: true },
  ].filter(fact => fact.value)
})

/** 首屏最多展示 12 张，其余点「显示全部」再渲染，避免一次拉 70+ 张大图。 */
const IMAGE_PREVIEW_LIMIT = 12
const showAllImages = ref(false)
const visibleImages = computed(() => (
  showAllImages.value ? brandImages.value : brandImages.value.slice(0, IMAGE_PREVIEW_LIMIT)
))

/* ------------------------------- 律所资料 ------------------------------- */

const firmCoverFailed = ref(false)
/** 律所图片是横长图：优先 law_firms.logo_url，其次第一张采集图。 */
const firmCover = computed(() => summary.value?.logoUrl || summary.value?.images?.[0] || '')

const firmFacts = computed(() => {
  const item = summary.value
  if (!item) return []
  const website = safeExternalUrl(item.website)
  // 顺序即版式：第一排「简称 | 侵权类型」，第二排「官网 | 关联案件」，地址单独整行放下面。
  return [
    { label: '简称', value: item.shortName || '', href: '', wide: false },
    { label: '侵权类型', value: typeLabels.value, href: '', wide: false },
    { label: '官网', value: website ? externalUrlLabel(website) : '', href: website, wide: false },
    { label: '关联案件', value: item.caseCount > 0 ? `${item.caseCount} 起` : '暂无公开案件', href: '', wide: false },
    { label: '地址', value: item.address || '', href: '', wide: true },
  ].filter(fact => fact.value)
})

// 切换实体（同一组件复用时）重置图片展开与封面失败状态。
watch(() => props.slug, () => {
  showAllImages.value = false
  firmCoverFailed.value = false
})

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
          <!-- 品牌：资料 + 介绍 + 图片；不展示历史发案 -->
          <template v-if="kind === 'brand'">
            <header class="entity-detail__profile entity-detail__profile--brand">
              <div class="entity-detail__headline">
                <p class="entity-detail__eyebrow">品牌档案 · BRAND PROFILE</p>
                <h1>{{ summary.name }}</h1>
                <dl v-if="brandFacts.length" class="entity-detail__facts">
                  <div
                    v-for="fact in brandFacts"
                    :key="fact.label"
                    :class="{ 'entity-detail__fact--wide': fact.wide }"
                  >
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

            <!-- 历史发案：小程序「起诉信息」原样展示，不查 cases 表 -->
            <section v-if="historyCases.length" class="entity-detail__section">
              <h2>历史发案</h2>
              <div class="entity-detail__case-table-wrap">
                <table class="entity-detail__case-table">
                  <thead>
                    <tr>
                      <th scope="col">起诉时间</th>
                      <th scope="col">案件号</th>
                      <th scope="col">代理律所</th>
                      <th scope="col">受理法院</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in historyCases" :key="`${row.caseNumber}-${index}`">
                      <td>{{ row.filedAt || '—' }}</td>
                      <td>{{ row.caseNumber }}</td>
                      <td>{{ row.lawFirm || '—' }}</td>
                      <td>{{ row.court || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>

          <!-- 律所：图片在名称右侧 + 资料 + 介绍 + 图片（不再嵌入历史案件列表） -->
          <template v-else>
            <header class="entity-detail__profile entity-detail__profile--firm">
              <div class="entity-detail__headline">
                <p class="entity-detail__eyebrow">代理律所 · LAW FIRM PROFILE</p>
                <h1>{{ summary.name }}</h1>
                <dl v-if="firmFacts.length" class="entity-detail__facts">
                  <div
                    v-for="fact in firmFacts"
                    :key="fact.label"
                    :class="{ 'entity-detail__fact--wide': fact.wide }"
                  >
                    <dt>{{ fact.label }}</dt>
                    <dd>
                      <a
                        v-if="fact.href"
                        :href="fact.href"
                        target="_blank"
                        rel="noopener noreferrer"
                      >{{ fact.value }}</a>
                      <template v-else>{{ fact.value }}</template>
                    </dd>
                  </div>
                </dl>
              </div>
              <!-- 律所图片是 1500×600 左右的横长图，作为资料卡底部的通栏展示 -->
              <figure v-if="firmCover && !firmCoverFailed" class="entity-detail__banner">
                <img
                  :src="firmCover"
                  :alt="`${summary.name}图片`"
                  decoding="async"
                  @error="firmCoverFailed = true"
                >
              </figure>
            </header>

            <section v-if="summary.intro" class="entity-detail__section">
              <h2>律所介绍</h2>
              <!-- intro 已在服务端按白名单清洗（toSafeRichText），这里只做排版 -->
              <div class="entity-detail__rich" v-html="summary.intro" />
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

/* 资料卡：文字在上、图片通栏在下（品牌与律所共用） */
.entity-detail__profile { display:grid; grid-template-columns:minmax(0,1fr); gap:var(--space-6); padding:var(--space-8); overflow:hidden; border:1px solid var(--color-border); border-top:3px solid var(--color-primary); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); }
/* 右下角通栏图：图片按原比例贴到卡片左下角，不铺底色、不裁切，避免出现白边 */
.entity-detail__banner { display:flex; justify-content:flex-start; margin:0 calc(-1 * var(--space-8)) calc(-1 * var(--space-8)); background:transparent; border-top:1px solid var(--color-border); }
.entity-detail__banner img { display:block; width:auto; max-width:100%; height:auto; max-height:380px; object-fit:contain; }
.entity-detail__headline { min-width:0; }
.entity-detail__eyebrow { color:var(--color-primary); font-size:var(--text-xs); font-weight:700; letter-spacing:.1em; }
/* 品牌名可能很长（最长 57 字），标题比其它页面小一号，避免占满整屏 */
.entity-detail__headline h1 { margin:var(--space-3) 0 var(--space-5); font-size:clamp(20px, 2.2vw, 28px); line-height:1.4; overflow-wrap:anywhere; }
/* 资料两列：短字段两两成排，较长的字段整行（品牌与律所共用同一套版式） */
.entity-detail__facts { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:var(--space-3) var(--space-6); max-width:820px; margin:0; padding-left:var(--space-4); border-left:2px solid color-mix(in srgb, var(--color-primary) 28%, transparent); }
.entity-detail__facts > div { display:grid; grid-template-columns:5.5em minmax(0, 1fr); align-items:baseline; gap:var(--space-4); min-width:0; }
.entity-detail__facts > .entity-detail__fact--wide { grid-column:1 / -1; }
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

/* 历史发案：小程序「起诉信息」原样表格 */
.entity-detail__case-table-wrap { margin-top:var(--space-4); overflow-x:auto; }
.entity-detail__case-table { width:100%; min-width:600px; border-collapse:collapse; font-size:var(--text-sm); }
.entity-detail__case-table th,
.entity-detail__case-table td { padding:var(--space-3); text-align:left; border-bottom:1px solid var(--color-border); vertical-align:top; }
.entity-detail__case-table th { background:var(--color-bg-light); color:var(--color-text-muted); font-size:var(--text-xs); font-weight:600; white-space:nowrap; }
.entity-detail__case-table td { color:var(--color-text); }
.entity-detail__case-table td:nth-child(2) { word-break:break-all; }
.entity-detail__case-table tbody tr:last-child td { border-bottom:none; }
.entity-detail__case-table tbody tr:hover { background:var(--color-bg-light); }



@media(max-width:767px) {
  .entity-detail__profile { gap:var(--space-5); padding:var(--space-5); }
  /* 手机端资料收成单列，避免两列挤在一起 */
  .entity-detail__facts { grid-template-columns:minmax(0, 1fr); }
  /* 手机端横图同样通栏，左右贴到卡片内边距之外 */
  .entity-detail__banner { margin:0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5)); }
  .entity-detail__section { padding:var(--space-5); }
}
@media(max-width:639px) {
  .entity-detail__gallery { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
</style>
