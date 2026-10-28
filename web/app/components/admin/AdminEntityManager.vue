<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminEntityItem } from '~/types/adminContent'
import {
  ADMIN_PAGE_SIZE,
  adminRequestErrorMessage,
  requestAdminApi,
  toAdminQuery,
  toPageMeta,
  type AdminPageMeta,
  type AdminWriteResult,
} from '~/utils/adminApi'
import { canWriteContent, READ_ONLY_NOTICE } from '~/utils/adminPermission'
import { safeExternalUrl } from '~/utils/content'
import { sanitizeHtml } from '~/utils/publicHtml'

/**
 * 品牌 / 律所后台：只读查看 + 归档。
 *
 * 这两类数据现在由小程序后台采集维护，后台不再提供编辑表单：
 * 列表展示当前字段，点「查看」打开只读详情（基础字段 + 采集字段 + 简介 + 图片）。
 * 删除仍是软删除（status = 0），用于隐藏不合适的采集记录。
 */
const props = defineProps<{
  /** 列表 / 详情接口前缀，例如 /api/admin/brands */
  endpoint: string
  /** 实体中文名（单数），例如「品牌」 */
  entityLabel: string
  /** 决定列表列与详情字段：品牌看分类/品牌方，律所看简称/官网 */
  kind: 'brand' | 'firm'
}>()

const { user, load } = useAdminSession()
await load()

/**
 * 后台接口必须用 useRequestFetch：SSR 期间对 /api/admin/** 的相对请求要转发用户请求头
 * （含 HttpOnly 会话 Cookie），否则服务端取不到登录态，已登录用户首屏会看到「未登录」。
 */
const requestFetch = useRequestFetch()

const canWrite = computed(() => canWriteContent(user.value))
const readOnlyReason = READ_ONLY_NOTICE

/** 搜索字段与公开站一致：品牌看名称 / 英文名 / 别名，律所看名称 / 简称 / 英文名。 */
const keywordPlaceholder = computed(() =>
  props.kind === 'firm' ? '律所名称 / 简称 / 英文名' : '品牌名称 / 英文名 / 别名'
)

/** 列表查询条件 */
const keyword = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

interface EntityListPayload {
  items: AdminEntityItem[]
  meta: AdminPageMeta
}

const listKey = computed(() =>
  `admin-entity:${props.endpoint}:${keyword.value.trim()}:${page.value}:${pageSize.value}`
)

async function fetchEntityPage(targetPage: number): Promise<EntityListPayload> {
  const payload = await requestFetch<{ data?: AdminEntityItem[], meta?: Record<string, unknown> }>(props.endpoint, {
    query: toAdminQuery({
      keyword: keyword.value.trim(),
      status: 1,
      page: targetPage,
      pageSize: pageSize.value
    })
  })
  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    meta: toPageMeta(payload?.meta, { page: targetPage, pageSize: pageSize.value })
  }
}

const {
  data: listData,
  status: listStatus,
  error: listError,
  refresh: refreshList
} = await useAsyncData<EntityListPayload>(
  listKey,
  async () => {
    const first = await fetchEntityPage(page.value)
    // 服务端把越界页夹到最后一页；按其返回的页码再取一次。
    if (page.value > first.meta.totalPages && first.meta.totalPages >= 1) {
      const retry = await fetchEntityPage(first.meta.totalPages)
      page.value = retry.meta.page
      return retry
    }
    return first
  },
  { watch: [listKey], default: defaultListPayload }
)

/** 未加载时的空载荷；总数与总页数一律等接口 meta，不自行估算。 */
function defaultListPayload(): EntityListPayload {
  return {
    items: [],
    meta: { page: page.value, pageSize: pageSize.value, total: 0, totalPages: 1 }
  }
}

const items = computed(() => listData.value.items)
const meta = computed<AdminPageMeta>(() => listData.value.meta)
const isLoading = computed(() => listStatus.value === 'pending')
const listErrorMessage = computed(() =>
  adminRequestErrorMessage(listError.value, `${props.entityLabel}列表加载失败，请稍后重试`)
)

watch(keyword, () => { page.value = 1 }, { flush: 'sync' })

const notice = ref('')
const actionError = ref('')

/* ------------------------------- 查看详情 ------------------------------- */

const viewOpen = ref(false)
const viewingId = ref<number | null>(null)
const viewItem = ref<AdminEntityItem | null>(null)
const viewLoading = ref(false)
const viewError = ref('')

/**
 * 列表在上、详情在下，不滚动的话点「查看」后视口仍停在列表，看起来像没反应。
 * ref 必须挂在原生元素上（组件上的 ref 拿到的是组件实例，没有 scrollIntoView）。
 */
const viewerRef = ref<HTMLElement | null>(null)
const { requestScrollToEditor } = useScrollToEditor(viewerRef, { selector: '[data-scroll-target="entity-viewer"]' })

async function openView(item: AdminEntityItem) {
  viewOpen.value = true
  viewingId.value = item.id
  // 先用列表行填充，详情返回后覆盖，避免请求期间面板是空的。
  viewItem.value = item
  viewError.value = ''
  viewLoading.value = true
  requestScrollToEditor()
  try {
    const detail = await requestAdminApi<Record<string, AdminEntityItem>>(`${props.endpoint}/${item.id}`, { requestFetch })
    viewItem.value = detail[props.kind === 'brand' ? 'brand' : 'lawFirm'] ?? item
  } catch (error) {
    viewError.value = adminRequestErrorMessage(error, `${props.entityLabel}详情加载失败，请稍后重试`)
  } finally {
    viewLoading.value = false
  }
}

function closeView() {
  viewOpen.value = false
  viewingId.value = null
  viewItem.value = null
  viewError.value = ''
}

/** 只读字段：空值不占位，官网渲染成可点击链接。 */
const viewFacts = computed(() => {
  const item = viewItem.value
  if (!item) return []
  const facts: Array<{ label: string, value: string, href?: string }> = [
    { label: '英文名', value: item.nameEn },
    { label: '别名', value: item.aliases },
  ]
  if (props.kind === 'brand') {
    facts.push(
      { label: '品牌分类', value: item.ipCategory },
      { label: '品牌方', value: item.brandOwner },
    )
    // 分类为空时服务端会回退到起诉类型，两者相同就不再重复展示一行。
    if (item.lawsuitType && item.lawsuitType !== item.ipCategory) {
      facts.push({ label: '起诉类型', value: item.lawsuitType })
    }
    facts.push({ label: '默认律所', value: item.defaultLawFirm })
  } else {
    facts.push(
      { label: '简称', value: item.shortName },
      { label: '地址', value: item.address },
      { label: '官网', value: item.website, href: safeExternalUrl(item.website) },
      { label: '地区', value: item.region },
    )
  }
  facts.push(
    { label: '关联案件', value: `${item.caseCount} 件` },
  )
  // 品牌保留状态与时间；律所只看业务字段（状态用右上角徽标表示）。
  if (props.kind === 'brand') {
    facts.push(
      { label: '状态', value: item.status === 1 ? '正常' : '已隐藏' },
      { label: '创建时间', value: item.createdAt },
      { label: '更新时间', value: item.updatedAt },
    )
  }
  return facts.filter(fact => fact.value)
})

/** 头图：品牌优先采集封面，其次 logo；律所用 logo_url。 */
const viewCover = computed(() => {
  const item = viewItem.value
  if (!item) return ''
  return props.kind === 'brand' ? (item.coverUrl || item.logoUrl) : item.logoUrl
})

/** 采集简介：后台同样按白名单清洗后再渲染，不直接输出历史 HTML。 */
const viewIntro = computed(() => sanitizeHtml(viewItem.value?.intro ?? ''))

const viewImages = computed(() => viewItem.value?.images ?? [])

async function onDelete(item: AdminEntityItem) {
  if (!canWrite.value) return
  const accepted = window.confirm(`确认删除「${item.name}」？该记录会从管理列表隐藏，已有关联案件会保留。`)
  if (!accepted) return

  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`${props.endpoint}/${item.id}`, { method: 'DELETE', requestFetch })
    notice.value = `${props.entityLabel}「${item.name}」已删除`
    if (viewingId.value === item.id) closeView()
    await refreshList()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, `${props.entityLabel}删除失败，请稍后重试`)
  }
}

function onPageSize(next: number) {
  pageSize.value = next
  page.value = 1
}
</script>

<template>
  <PageContainer class="admin-entity" size="wide">
    <p v-if="!canWrite" class="admin-entity__readonly" role="note">{{ readOnlyReason }}</p>
    <p v-if="notice" class="admin-entity__notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="admin-entity__error" role="alert">{{ actionError }}</p>

    <form class="admin-entity__filters admin-entity__filter-form" role="search" @submit.prevent="page = 1">
        <div class="admin-entity__field">
          <label class="admin-entity__label" for="entity-keyword">关键词</label>
          <input
            id="entity-keyword"
            v-model="keyword"
            class="admin-entity__input"
            type="search"
            :placeholder="keywordPlaceholder"
          >
        </div>
        <BaseButton variant="secondary" size="sm" type="submit">搜索</BaseButton>
    </form>

    <section class="admin-entity__list" :aria-label="`${entityLabel}列表`" aria-live="polite">
      <template v-if="listError">
        <ErrorState :title="`${entityLabel}列表加载失败`" :message="listErrorMessage" @retry="refreshList" />
      </template>

      <template v-else>
        <p v-if="isLoading" class="admin-entity__loading" role="status">正在加载{{ entityLabel }}列表…</p>

        <div v-if="items.length" class="admin-entity__table-wrap">
          <table class="admin-entity__table">
            <caption class="admin-entity__caption">
              共 {{ meta.total }} 条{{ entityLabel }}，当前第 {{ meta.page }} / {{ meta.totalPages }} 页
            </caption>
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">{{ kind === 'brand' ? '品牌分类' : '简称' }}</th>
                <th scope="col">{{ kind === 'brand' ? '品牌方' : '官网' }}</th>
                <th scope="col">关联案件数</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>
                  <span class="admin-entity__cell-title">{{ item.name }}</span>
                </td>
                <td>{{ (kind === 'brand' ? item.ipCategory : item.shortName) || '—' }}</td>
                <td>
                  <template v-if="kind === 'brand'">{{ item.brandOwner || '—' }}</template>
                  <a v-else-if="safeExternalUrl(item.website)" :href="safeExternalUrl(item.website)" target="_blank" rel="noopener noreferrer">
                    {{ item.website }}
                  </a>
                  <template v-else>—</template>
                </td>
                <td>{{ item.caseCount }} 件</td>
                <td>{{ item.updatedAt }}</td>
                <td class="admin-entity__cell-actions">
                  <BaseButton variant="secondary" size="sm" @click="openView(item)">查看</BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    :disabled="!canWrite"
                    :title="canWrite ? undefined : readOnlyReason"
                    @click="onDelete(item)"
                  >
                    删除
                  </BaseButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="!isLoading" class="admin-entity__empty">
          <p class="admin-entity__empty-title">没有符合条件的{{ entityLabel }}</p>
          <p class="admin-entity__empty-desc">请调整关键词后重试。</p>
        </div>

        <AdminPager
          :page="meta.page"
          :total-pages="meta.totalPages"
          :total="meta.total"
          :page-size="meta.pageSize"
          :noun="`条${entityLabel}`"
          @update:page="page = $event"
          @update:page-size="onPageSize"
        />
      </template>
    </section>

    <!-- ref 挂在原生元素上：组件上的 ref 是组件实例，没有 scrollIntoView -->
    <div v-if="viewOpen" ref="viewerRef" data-scroll-target="entity-viewer" class="admin-entity__viewer">
      <BaseCard>
        <p v-if="viewLoading" class="admin-entity__loading" role="status">正在加载{{ entityLabel }}详情…</p>
        <p v-if="viewError" class="admin-entity__error" role="alert">{{ viewError }}</p>

        <template v-if="viewItem">
          <h3 class="admin-entity__view-name">{{ viewItem.name }}</h3>

          <div v-if="viewCover" class="admin-entity__view-cover">
            <img :src="viewCover" :alt="`${viewItem.name}图片`" loading="lazy" decoding="async">
          </div>

          <dl class="admin-entity__view-facts">
            <div v-for="fact in viewFacts" :key="fact.label">
              <dt>{{ fact.label }}</dt>
              <dd>
                <a v-if="fact.href" :href="fact.href" target="_blank" rel="noopener noreferrer">{{ fact.value }}</a>
                <template v-else>{{ fact.value }}</template>
              </dd>
            </div>
          </dl>

          <section v-if="viewItem.summary" class="admin-entity__view-section">
            <h4>简介</h4>
            <p>{{ viewItem.summary }}</p>
          </section>

          <section v-if="viewIntro" class="admin-entity__view-section">
            <h4>采集介绍</h4>
            <div class="admin-entity__rich" v-html="viewIntro" />
          </section>

          <section v-if="viewImages.length" class="admin-entity__view-section">
            <h4>采集图片（{{ viewImages.length }} 张）</h4>
            <div class="admin-entity__gallery">
              <a
                v-for="(image, index) in viewImages"
                :key="image"
                :href="image"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img :src="image" :alt="`${viewItem.name}图片 ${index + 1}`" loading="lazy" decoding="async">
              </a>
            </div>
          </section>

          <!-- 小程序「起诉信息」：品牌历史发案，原样展示 -->
          <section v-if="viewItem.historyCases?.length" class="admin-entity__view-section">
            <h4>历史发案（{{ viewItem.historyCases.length }} 行）</h4>
            <div class="admin-entity__case-wrap">
              <table class="admin-entity__case-table">
                <thead>
                  <tr>
                    <th scope="col">起诉时间</th>
                    <th scope="col">案件号</th>
                    <th scope="col">代理律所</th>
                    <th scope="col">受理法院</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in viewItem.historyCases" :key="`${row.caseNumber}-${index}`">
                    <td>{{ row.filedAt || '—' }}</td>
                    <td>{{ row.caseNumber }}</td>
                    <td>{{ row.lawFirm || '—' }}</td>
                    <td>{{ row.court || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div class="admin-entity__actions">
            <BaseButton variant="secondary" @click="closeView">关闭</BaseButton>
          </div>
        </template>
      </BaseCard>
    </div>

  </PageContainer>
</template>

<style scoped>
.admin-entity {
  padding-block: var(--space-8) var(--space-16);
}

.admin-entity__readonly {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-entity__notice {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 10%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-entity__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-entity__filters,
.admin-entity__viewer {
  margin-top: var(--space-6);
}

.admin-entity__filters {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
}

.admin-entity__filter-form {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
}

.admin-entity__filter-form .admin-entity__field { display: flex; flex: 1 1 auto; min-width: 0; gap: var(--space-3); }
.admin-entity__filter-form .admin-entity__label { flex: 0 0 auto; white-space: nowrap; }
.admin-entity__filter-form .admin-entity__input { flex: 1 1 auto; min-width: 0; }

@media (max-width: 520px) {
  .admin-entity__filter-form { flex-wrap: wrap; gap: var(--space-3); }
  .admin-entity__filter-form .admin-entity__field { flex: 1 1 100%; }
}

.admin-entity__field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.admin-entity__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-entity__input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-entity__list {
  margin-top: var(--space-6);
}

.admin-entity__loading {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-entity__table-wrap {
  overflow-x: auto;
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.admin-entity__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-entity__caption {
  padding: var(--space-3);
  text-align: left;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.admin-entity__table th,
.admin-entity__table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.admin-entity__table th {
  background-color: var(--color-bg-light);
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}

.admin-entity__cell-title {
  display: block;
  font-weight: 600;
  color: var(--color-text);
}

.admin-entity__cell-actions {
  display: flex;
  gap: var(--space-2);
  white-space: nowrap;
}

.admin-entity__empty {
  padding: var(--space-12) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.admin-entity__empty-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}

.admin-entity__empty-desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

/* 只读详情 */
.admin-entity__view-name { margin: 0; font-size: var(--text-xl); color: var(--color-text); overflow-wrap: anywhere; }
.admin-entity__view-cover { margin-top: var(--space-4); max-width: 360px; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: #f6f7f9; }
.admin-entity__view-cover img { display: block; width: 100%; height: auto; max-height: 240px; object-fit: contain; }
.admin-entity__view-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-6); margin-top: var(--space-5); }
.admin-entity__view-facts > div { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); align-items: baseline; gap: var(--space-3); }
.admin-entity__view-facts dt { color: var(--color-text-muted); font-size: var(--text-xs); }
.admin-entity__view-facts dd { margin: 0; color: var(--color-text); font-size: var(--text-sm); overflow-wrap: anywhere; }
.admin-entity__view-facts a { color: var(--color-primary); }
.admin-entity__view-section { margin-top: var(--space-6); }
.admin-entity__view-section h4 { margin-bottom: var(--space-2); font-size: var(--text-base); color: var(--color-text); }
.admin-entity__view-section p { color: var(--color-text-muted); font-size: var(--text-sm); line-height: var(--leading-relaxed); }
.admin-entity__rich { color: var(--color-text-muted); font-size: var(--text-sm); line-height: var(--leading-relaxed); overflow-wrap: anywhere; }
.admin-entity__rich :deep(p) { margin: 0 0 var(--space-3); }
.admin-entity__rich :deep(img) { max-width: 100%; height: auto; }
.admin-entity__rich :deep(a) { color: var(--color-primary); word-break: break-all; }
.admin-entity__gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: var(--space-3); }
.admin-entity__gallery a { display: block; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: #f6f7f9; }
.admin-entity__gallery img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
/* 历史发案（小程序「起诉信息」） */
.admin-entity__case-wrap { margin-top: var(--space-2); overflow-x: auto; }
.admin-entity__case-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: var(--text-sm); }
.admin-entity__case-table th,
.admin-entity__case-table td { padding: var(--space-2) var(--space-3); text-align: left; border-bottom: 1px solid var(--color-border); vertical-align: top; }
.admin-entity__case-table th { background: var(--color-bg-light); color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
.admin-entity__case-table td { color: var(--color-text); }
.admin-entity__case-table td:nth-child(2) { word-break: break-all; }
.admin-entity__case-table tbody tr:last-child td { border-bottom: none; }
.admin-entity__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-6);
}

@media (max-width: 767px) {
  .admin-entity__view-facts { grid-template-columns: minmax(0, 1fr); }
  .admin-entity__view-cover { max-width: 100%; }
}
</style>
