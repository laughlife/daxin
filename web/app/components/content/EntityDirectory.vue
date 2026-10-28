<script setup lang="ts">
import { fetchBrands, fetchLawFirms } from '~/repositories/entities'
import { externalUrlLabel, safeExternalUrl } from '~/utils/content'

/**
 * 品牌 / 律所目录。
 *
 * 列表来自 `~/repositories/entities` 的 fetchBrands() / fetchLawFirms()，
 * caseCount 由接口给出；目录页只做名称 / 简介的关键词定位，不再对案件做本地筛选。
 * 支持通过 URL query `q` 定位（案件列表里的品牌 / 律所入口会带上该参数）。
 *
 * 律所额外展示小程序来源的简称 / 地址 / 官网；品牌没有这三项。
 */
interface EntitySummary {
  slug: string
  name: string
  description: string
  caseCount: number
  shortName?: string
  address?: string
  website?: string
}

const props = defineProps<{ kind: 'brand' | 'firm' }>()

const route = useRoute()
const router = useRouter()
const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '')

const { data, error, refresh } = await useAsyncData(
  () => `entity-directory:${props.kind}`,
  () => props.kind === 'brand' ? fetchBrands() : fetchLawFirms()
)

const title = computed(() => props.kind === 'brand' ? '侵权品牌库' : 'TRO 原告律所')
const errorMessage = computed(() =>
  error.value instanceof Error && error.value.message
    ? error.value.message
    : '目录加载失败，请稍后重试'
)

/** 只把 http(s) 官网渲染成链接，其它协议（含 javascript:）一律当普通文字。 */
function safeWebsite(value?: string): string {
  return safeExternalUrl(value)
}

/** 官网省略协议头展示，避免卡片里出现又长又重复的 https://。 */
function websiteLabel(value: string): string {
  return externalUrlLabel(value)
}

const entities = computed<EntitySummary[]>(() => data.value ?? [])
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return entities.value
  return entities.value.filter(item => [
    item.name,
    item.description,
    item.shortName ?? '',
    item.address ?? '',
  ].join(' ').toLowerCase().includes(query))
})
const totalCases = computed(() => entities.value.reduce((sum, item) => sum + item.caseCount, 0))
const stats = computed(() => [
  { label: props.kind === 'brand' ? '收录品牌' : '收录律所', count: entities.value.length },
  { label: '关联案件', count: totalCases.value }
])

watch(keyword, value => {
  if (!import.meta.client) return
  const next = value.trim()
  const current = typeof route.query.q === 'string' ? route.query.q : ''
  if (next === current) return
  void router.replace({ query: next ? { q: next } : {} })
})
watch(() => route.query.q, value => {
  const next = typeof value === 'string' ? value : ''
  if (next !== keyword.value) keyword.value = next
})

useSeoMeta({
  title: () => title.value,
  description: '按名称检索品牌与原告律所，查看公开案件资料与历史发案。'
})
</script>

<template>
  <div class="directory">
    <PageContainer>
      <SectionHeading
        :level="1"
        :title="title"
      />
      <ContentColumns group="tro">
        <ContentSectionTabs v-if="kind === 'firm'" path="/faq/plaintiff-firms" />

        <ErrorState
          v-if="error"
          title="目录加载失败"
          :message="errorMessage"
          @retry="refresh"
        />

        <template v-else>
          <section class="directory__stats" aria-label="统计">
            <h2>收录统计</h2>
            <div class="directory__stats-grid">
              <div v-for="stat in stats" :key="stat.label">
                <strong>{{ stat.count }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            </div>
          </section>

          <form class="directory__search" role="search" @submit.prevent>
            <label>
              <span>关键词</span>
              <input v-model="keyword" type="search" placeholder="品牌名或律所名">
            </label>
          </form>

          <p class="directory__notice">
            共 {{ filtered.length }} {{ kind === 'brand' ? '个品牌' : '家律所' }} · 公开案件资料
          </p>

          <div class="directory__grid">
            <article v-for="item in filtered" :key="item.slug" class="directory__card">
              <p class="directory__label">{{ kind === 'brand' ? '品牌档案' : '律所档案' }}</p>
              <h2>
                <NuxtLink :to="`${kind === 'brand' ? '/brands' : '/law-firms'}/${item.slug}`">{{ item.name }}</NuxtLink>
              </h2>
              <!-- 律所卡片只保留名称 / 简称 / 官网 / 关联案件（不放图片，也不显示「简介资料整理后补充」占位） -->
              <template v-if="kind === 'firm'">
                <p v-if="item.shortName" class="directory__short-name">
                  简称：<strong>{{ item.shortName }}</strong>
                </p>
                <p v-if="safeWebsite(item.website)" class="directory__website">
                  官网：<a :href="safeWebsite(item.website)" target="_blank" rel="noopener noreferrer">{{ websiteLabel(safeWebsite(item.website)) }}</a>
                </p>
              </template>
              <p v-else class="directory__description">
                {{ item.description || '简介资料整理后补充。' }}
              </p>
              <p class="directory__count">{{ item.caseCount }} 条关联案件</p>
            </article>
          </div>

          <p v-if="!filtered.length" class="directory__notice" role="status">
            未找到匹配资料，请调整关键词。
          </p>
        </template>
      </ContentColumns>
    </PageContainer>
  </div>
</template>

<style scoped>
.directory { padding-block:var(--space-section); background:var(--color-bg-light); }
.directory :deep(.content-columns) { margin-top:var(--space-8); }
.directory__stats { margin-bottom:var(--space-5); padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); }
.directory__stats h2 { margin-bottom:var(--space-4); font-size:var(--text-xl); }
.directory__stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--space-3); }
.directory__stats-grid > div { display:flex; flex-direction:column; gap:var(--space-2); padding:var(--space-4); border-radius:var(--radius-md); background:var(--color-bg-light); text-align:center; }
.directory__stats-grid strong { color:var(--color-primary); font-size:var(--text-2xl); }
.directory__stats-grid span { color:var(--color-text-muted); font-size:var(--text-sm); }
.directory__stats > p { margin-top:var(--space-4); color:var(--color-text-muted); font-size:var(--text-xs); line-height:var(--leading-relaxed); }
.directory__search { display:grid; grid-template-columns:minmax(0,1fr); gap:var(--space-4); padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); }
.directory__search label { display:grid; grid-template-columns:max-content minmax(0,1fr); align-items:center; gap:var(--space-4); color:var(--color-text-muted); font-size:var(--text-sm); }
input,select { width:100%; min-width:0; }
.directory__notice { margin:var(--space-5) 0; color:var(--color-text-muted); font-size:var(--text-sm); } .directory__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); }
.directory__card { padding:var(--space-6); border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-page); box-shadow:var(--shadow-sm); } .directory__label { margin-bottom:var(--space-3); color:var(--color-primary); font-size:var(--text-xs); } h2 { margin-bottom:var(--space-3); font-size:var(--text-lg); font-weight:600; line-height:1.35; } h2 a { color:var(--color-text); } .directory__card > a { font-size:var(--text-sm); }
/* 字号与品牌列表保持一致：名称 19px，各项信息 13px */
.directory__card > p:not(.directory__label) { margin:0 0 var(--space-2); color:var(--color-text-muted); font-size:var(--text-xs); line-height:1.45; }
.directory__card > p:last-child { margin-bottom:0; }
.directory__short-name { margin-bottom:var(--space-2); } .directory__short-name strong { color:var(--color-text); }
.directory__website a { color:var(--color-primary); overflow-wrap:anywhere; }
.directory__description { margin:var(--space-3) 0 0; }
@media(max-width:639px) { .directory__stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .directory__grid { grid-template-columns:1fr; } .directory__search { grid-template-columns:1fr; } .directory__search label { gap:var(--space-3); } }
</style>
