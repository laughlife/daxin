<script setup lang="ts">
import { fetchBrands, fetchLawFirms } from '~/repositories/entities'

/**
 * 品牌 / 律所目录。
 *
 * 列表来自 `~/repositories/entities` 的 fetchBrands() / fetchLawFirms()，
 * caseCount 由接口给出；目录页只做名称 / 简介的关键词定位，不再对案件做本地筛选。
 * 支持通过 URL query `q` 定位（案件列表里的品牌 / 律所入口会带上该参数）。
 */
interface EntitySummary {
  slug: string
  name: string
  description: string
  caseCount: number
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

const entities = computed<EntitySummary[]>(() => data.value ?? [])
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return entities.value
  return entities.value.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query))
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
        :description="kind === 'brand' ? '按名称检索品牌，查看品牌历史发案。' : '查看原告代理律所介绍与代理的历史案件。'"
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
            <p>统计来自公开案件资料，按{{ kind === 'brand' ? '品牌' : '律所' }}去重；同一案件可能涉及多个品牌与律所。</p>
          </section>

          <form class="directory__search" role="search" @submit.prevent>
            <label>
              关键词
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
              <p>{{ item.description || '简介资料整理后补充。' }}</p>
              <p class="directory__count">{{ item.caseCount }} 条关联案件</p>
              <NuxtLink :to="`${kind === 'brand' ? '/brands' : '/law-firms'}/${item.slug}`">
                查看{{ kind === 'brand' ? '品牌历史发案' : '律所介绍与案件' }} →
              </NuxtLink>
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
.directory { padding:40px 0 64px; background:var(--color-bg-light); }
.directory :deep(.content-columns) { margin-top:28px; }
.directory__stats { padding:20px; margin-bottom:20px; border:1px solid var(--color-border); border-radius:12px; background:white; }
.directory__stats h2 { font-size:18px; margin-bottom:16px; }
.directory__stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.directory__stats-grid > div { display:flex; flex-direction:column; gap:6px; padding:12px; text-align:center; background:var(--color-bg-light); border-radius:8px; }
.directory__stats-grid strong { font-size:28px; color:var(--color-primary); }
.directory__stats-grid span { font-size:13px; color:var(--color-text-muted); }
.directory__stats > p { font-size:12px; color:var(--color-text-muted); margin-top:14px; line-height:1.7; }
.directory__search { display:grid; grid-template-columns:1fr; gap:14px; padding:20px; background:white; border-radius:12px; border:1px solid var(--color-border); }
label { display:flex; flex-direction:column; gap:6px; font-size:13px; min-width:0; } input,select { width:100%; min-width:0; padding:10px; border:1px solid var(--color-border); border-radius:6px; font:inherit; background:white; }
.directory__notice { font-size:13px; color:var(--color-text-muted); margin:18px 0; } .directory__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.directory__card { background:white; border:1px solid var(--color-border); border-radius:12px; padding:24px; } .directory__label { color:var(--color-primary); font-size:12px; margin-bottom:12px; } h2 { font-size:20px; margin-bottom:12px; } h2 a { color:var(--color-text); } .directory__card > p:not(:first-child) { font-size:14px; color:var(--color-text-muted); line-height:1.8; } .directory__count { margin:14px 0; } .directory__card > a { font-size:14px; }
@media(max-width:639px) { .directory__stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .directory__grid { grid-template-columns:1fr; } .directory__search { grid-template-columns:1fr; } }
</style>
