<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
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

/**
 * 品牌 / 律所共用的后台管理界面。
 *
 * 两者字段、列表列和编辑表单基本一致，唯一差异是：
 *   - 接口路径不同（/api/admin/brands、/api/admin/law-firms）；
 *   - 律所多一个 region 字段（品牌没有该列，接口也会忽略它）。
 * 因此用同一个组件 + props 配置，避免复制两份易走样的页面代码。
 *
 * 表格列固定为：名称、英文名、关联案件数、更新时间（caseCount 只读，绝不提交）。
 */
const props = withDefaults(defineProps<{
  /** 列表 / 详情接口前缀，例如 /api/admin/brands */
  endpoint: string
  /** 实体中文名（单数），例如「品牌」 */
  entityLabel: string
  /** 是否显示「地区」字段（只有律所有） */
  withRegion?: boolean
  /** 品牌编辑时提供 Logo 上传 */
  withLogo?: boolean
}>(), {
  withRegion: false,
  withLogo: false
})

const { user, load } = useAdminSession()
await load()

/**
 * 后台接口必须用 useRequestFetch：SSR 期间对 /api/admin/** 的相对请求要转发用户请求头
 * （含 HttpOnly 会话 Cookie），否则服务端取不到登录态，已登录用户首屏会看到「未登录」。
 */
const requestFetch = useRequestFetch()

const canWrite = computed(() => canWriteContent(user.value))
const readOnlyReason = READ_ONLY_NOTICE

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

/** 编辑器 */
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const saveError = ref('')
const detailLoading = ref(false)
const detailError = ref('')

interface EntityForm {
  slug: string
  name: string
  nameEn: string
  aliases: string
  region: string
  summary: string
  logoMediaId: number | null
  logoUrl: string
  status: string
}

const form = reactive<EntityForm>({
  slug: '',
  name: '',
  nameEn: '',
  aliases: '',
  region: '',
  summary: '',
  logoMediaId: null,
  logoUrl: '',
  status: '1'
})
const imageUploading = ref(false)

const nameError = computed(() => (form.name.trim() ? '' : `${props.entityLabel}名称不能为空`))
const formValid = computed(() => !nameError.value)

function resetForm() {
  form.slug = ''
  form.name = ''
  form.nameEn = ''
  form.aliases = ''
  form.region = ''
  form.summary = ''
  form.logoMediaId = null
  form.logoUrl = ''
  form.status = '1'
}

/**
 * 表单容器引用 + 打开表单后滚动到表单区域。
 * 列表在上、表单在下，不滚动的话点「编辑」后视口仍停在列表，看起来像没反应。
 * ref 必须挂在原生元素上（组件上的 ref 拿到的是组件实例，没有 scrollIntoView）。
 */
const editorRef = ref<HTMLElement | null>(null)
const { requestScrollToEditor } = useScrollToEditor(editorRef, { selector: '[data-scroll-target="entity-editor"]' })

async function openCreate() {
  editingId.value = null
  resetForm()
  saveError.value = ''
  detailError.value = ''
  editorOpen.value = true
  requestScrollToEditor()
}

async function openEdit(item: AdminEntityItem) {
  editorOpen.value = true
  editingId.value = item.id
  resetForm()
  saveError.value = ''
  detailError.value = ''
  detailLoading.value = true
  applyDetail(item)
  requestScrollToEditor()
  try {
    const detail = await requestAdminApi<Record<string, AdminEntityItem>>(`${props.endpoint}/${item.id}`, { requestFetch })
    const record = detail[props.withRegion ? 'lawFirm' : 'brand'] ?? detail.entity ?? item
    applyDetail(record)
  } catch (error) {
    detailError.value = adminRequestErrorMessage(error, `${props.entityLabel}详情加载失败，请稍后重试`)
  } finally {
    detailLoading.value = false
  }
}

function applyDetail(item: AdminEntityItem) {
  form.slug = item.slug
  form.name = item.name
  form.nameEn = item.nameEn
  form.aliases = item.aliases
  form.region = item.region
  form.summary = item.summary
  form.logoMediaId = item.logoMediaId ?? null
  form.logoUrl = item.logoUrl ?? ''
  form.status = String(item.status)
}

function onLogoUploaded(payload: { mediaId: number, mediaUrl: string }) {
  form.logoMediaId = payload.mediaId
  form.logoUrl = payload.mediaUrl
}

function closeEditor() {
  editorOpen.value = false
  editingId.value = null
  saveError.value = ''
  detailError.value = ''
}

/** 保存：新建 POST / 编辑 PUT；caseCount 只读，绝不提交。 */
async function onSubmit() {
  if (!canWrite.value) {
    saveError.value = readOnlyReason
    return
  }
  if (!formValid.value) {
    saveError.value = nameError.value
    return
  }
  saving.value = true
  saveError.value = ''
  notice.value = ''
  actionError.value = ''

  const body: Record<string, unknown> = {
    name: form.name.trim(),
    nameEn: form.nameEn,
    aliases: form.aliases,
    summary: form.summary,
    status: Number(form.status)
  }
  if (props.withLogo) body.logoMediaId = form.logoMediaId
  if (form.slug.trim()) body.slug = form.slug.trim()
  if (props.withRegion) body.region = form.region

  try {
    if (editingId.value === null) {
      await requestAdminApi<AdminWriteResult>(props.endpoint, { method: 'POST', body, requestFetch })
      notice.value = `${props.entityLabel}已新建`
    } else {
      await requestAdminApi<AdminWriteResult>(`${props.endpoint}/${editingId.value}`, { method: 'PUT', body, requestFetch })
      notice.value = `${props.entityLabel}已保存`
    }
    await refreshList()
    closeEditor()
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function onDelete(item: AdminEntityItem) {
  if (!canWrite.value) return
  const accepted = window.confirm(`确认删除「${item.name}」？该记录会从管理列表隐藏，已有关联案件会保留。`)
  if (!accepted) return

  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`${props.endpoint}/${item.id}`, { method: 'DELETE', requestFetch })
    notice.value = `${props.entityLabel}「${item.name}」已删除`
    if (editingId.value === item.id) closeEditor()
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
            :placeholder="`${entityLabel}名称 / 英文名 / slug / 别名`"
          >
        </div>
        <BaseButton variant="secondary" size="sm" type="submit">搜索</BaseButton>
        <BaseButton
          type="button"
          :disabled="!canWrite"
          :title="canWrite ? undefined : readOnlyReason"
          @click="openCreate"
        >新建{{ entityLabel }}</BaseButton>
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
                <th scope="col">英文名</th>
                <th scope="col">关联案件数</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>
                  <span class="admin-entity__cell-title">{{ item.name }}</span>
                  <span class="admin-entity__cell-sub">
                    {{ item.slug }}<template v-if="item.aliases">｜别名：{{ item.aliases }}</template>
                    <template v-if="withRegion && item.region">｜地区：{{ item.region }}</template>
                  </span>
                </td>
                <td>{{ item.nameEn || '—' }}</td>
                <td>{{ item.caseCount }} 件（只读）</td>
                <td>{{ item.updatedAt }}</td>
                <td class="admin-entity__cell-actions">
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="!canWrite"
                    :title="canWrite ? undefined : readOnlyReason"
                    @click="openEdit(item)"
                  >
                    编辑
                  </BaseButton>
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
    <div v-if="editorOpen" ref="editorRef" data-scroll-target="entity-editor" class="admin-entity__editor">
      <BaseCard
        :title="editingId === null ? `新建${entityLabel}` : `编辑${entityLabel} #${editingId}`"
        :title-level="2"
      >
      <p v-if="detailLoading" class="admin-entity__loading" role="status">正在加载{{ entityLabel }}详情…</p>
      <p v-if="detailError" class="admin-entity__error" role="alert">{{ detailError }}</p>

      <form class="admin-entity__form" novalidate @submit.prevent="onSubmit">
        <div class="admin-entity__grid">
          <div class="admin-entity__field">
            <label class="admin-entity__label" for="entity-name">名称（必填）</label>
            <input
              id="entity-name"
              v-model="form.name"
              class="admin-entity__input"
              type="text"
              maxlength="191"
              :disabled="!canWrite"
              :aria-invalid="Boolean(nameError)"
            >
            <p v-if="nameError" class="admin-entity__hint admin-entity__hint--error">{{ nameError }}</p>
          </div>

          <div class="admin-entity__field">
            <label class="admin-entity__label" for="entity-name-en">英文名</label>
            <input id="entity-name-en" v-model="form.nameEn" class="admin-entity__input" type="text" maxlength="191" :disabled="!canWrite">
          </div>

          <div v-if="withRegion" class="admin-entity__field">
            <label class="admin-entity__label" for="entity-region">地区</label>
            <input id="entity-region" v-model="form.region" class="admin-entity__input" type="text" maxlength="191" :disabled="!canWrite">
          </div>
        </div>

        <div class="admin-entity__field">
          <label class="admin-entity__label" for="entity-aliases">别名</label>
          <input
            id="entity-aliases"
            v-model="form.aliases"
            class="admin-entity__input"
            type="text"
            maxlength="512"
            :disabled="!canWrite"
          >
        </div>

        <div class="admin-entity__field">
          <label class="admin-entity__label" for="entity-summary">简介</label>
          <textarea
            id="entity-summary"
            v-model="form.summary"
            class="admin-entity__textarea"
            rows="4"
            :disabled="!canWrite"
          />
        </div>

        <div v-if="withLogo" class="admin-entity__brand-image">
          <span class="admin-entity__label">品牌图片</span>
          <SettingImageField
            input-id="entity-brand-logo"
            label="品牌图片"
            :media-url="form.logoUrl"
            :disabled="!canWrite || saving || detailLoading"
            usage-scope="logo"
            @uploaded="onLogoUploaded"
            @uploading="imageUploading = $event"
          />
        </div>

        <p v-if="saveError" class="admin-entity__error" role="alert">{{ saveError }}</p>
        <p v-if="!canWrite" class="admin-entity__readonly" role="note">{{ readOnlyReason }}</p>

        <div class="admin-entity__actions">
          <BaseButton
            type="submit"
            :disabled="!canWrite || !formValid || saving || detailLoading || imageUploading"
            :title="canWrite ? undefined : readOnlyReason"
          >
            {{ saving ? '保存中…' : '保存' }}
          </BaseButton>
          <BaseButton variant="secondary" :disabled="saving || imageUploading" @click="closeEditor">取消</BaseButton>
        </div>
      </form>
      </BaseCard>
    </div>

  </PageContainer>
</template>

<style scoped>
.admin-entity {
  padding-block: var(--space-8) var(--space-16);
}

.admin-entity__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-entity__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
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
.admin-entity__editor {
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

.admin-entity__input,
.admin-entity__select,
.admin-entity__textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-entity__select {
  max-width: 260px;
}

.admin-entity__input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.admin-entity__input:disabled,
.admin-entity__select:disabled,
.admin-entity__textarea:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-entity__textarea {
  width: 100%;
  max-width: 720px;
  resize: vertical;
}

.admin-entity__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-entity__hint--error {
  color: var(--color-error);
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

.admin-entity__cell-sub {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  word-break: break-all;
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

.admin-entity__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-entity__brand-image {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);
}

.admin-entity__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
}

.admin-entity__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

</style>
