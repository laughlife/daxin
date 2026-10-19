<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { AdminCaseDetail, AdminCaseItem } from '~/types/adminContent'
import {
  ADMIN_PAGE_SIZE,
  adminRequestErrorMessage,
  requestAdminApi,
  toAdminQuery,
  toDateValue,
  toPageMeta,
  type AdminPageMeta,
  type AdminWriteResult,
} from '~/utils/adminApi'
import { canWriteContent, READ_ONLY_NOTICE } from '~/utils/adminPermission'
import { caseTypeLabel, UNKNOWN_CASE_TYPE_LABEL } from '~/utils/caseTypeLabel'

/**
 * 案例管理（/admin/cases）。
 *
 * 列表展示案件字段、发布状态与操作；品牌 / 律所关联在编辑表单中显示名称。
 * 侵权类型统一经 `caseTypeLabel()` 渲染，无法确认时显示「待确认类型」，绝不臆造具体类型。
 *
 * 关联编辑（品牌 / 律所）：候选项来自后台列表接口（`/api/admin/brands`、`/api/admin/law-firms`），
 * 通过 AdminRemoteSelect 分页 + 关键词检索，不把 228 个品牌一次性塞进一个巨型 `<select>`。
 *
 * 侵权类型（ip_types）是只有 4 条的小字典，但后台没有任何接口能列出它（只返回 slug），
 * 因此用固定选项（seed 顺序的 id 1..4）并从案件详情里持续校正 id↔slug 映射
 * —— 详见 IP_TYPE_SEED 与 syncIpTypeFromObservation 的注释。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '案例管理',
  description: '后台案例列表与编辑。',
  robots: 'noindex, nofollow'
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

interface IpTypeOption {
  id: number
  slug: string
  label: string
}

/**
 * 侵权类型选项。
 *
 * 首选从后台字典接口 `GET /api/admin/ip-types` 读取真实的 id↔slug↔名称，
 * 不再依赖「按 seed 顺序猜测 id」——那是个无法验证的假设：一旦自增顺序与预期不同，
 * 下拉就会把商标标成专利。
 *
 * 字典接口不可用时退回到「只保底一个待确认类型」，并用案件详情里观测到的
 * （ipTypeId, caseType）持续校正/补齐选项，保证旧数据也不会被显示成错误类型。
 */
const FALLBACK_IP_TYPE_SLUG = 'unknown'
const ipTypes = ref<IpTypeOption[]>([])

/** 按 slug 生成中文标签；未知 slug 直接原样展示，不猜类型。 */
function labelForIpTypeSlug(slug: string): string {
  if (!slug) return UNKNOWN_CASE_TYPE_LABEL
  return slug === FALLBACK_IP_TYPE_SLUG ? UNKNOWN_CASE_TYPE_LABEL : caseTypeLabel(slug)
}

/** 拉取侵权类型字典；失败时只保留「待确认类型」并提示上层。 */
async function loadIpTypes() {
  try {
    const response = await requestFetch<{ data?: { id: number, slug: string, name: string }[] }>('/api/admin/ip-types')
    const items = response?.data ?? []
    if (items.length > 0) {
      ipTypes.value = items.map(item => ({
        id: Number(item.id),
        slug: String(item.slug ?? ''),
        label: labelForIpTypeSlug(String(item.slug ?? '')),
      }))
      return true
    }
  } catch {
    // 落到下面的保底分支
  }
  // 保底：只保留待确认类型，避免用猜测的 id 展示具体类型
  ipTypes.value = [{ id: 0, slug: FALLBACK_IP_TYPE_SLUG, label: UNKNOWN_CASE_TYPE_LABEL }]
  return false
}

/** 用（id, slug）观测校正 id↔slug 映射；slug 未知时只补齐 id，不改标签。 */
function syncIpTypeFromObservation(id: number | null, slug: string) {
  if (id === null || !Number.isInteger(id) || id <= 0) return
  const existing = ipTypes.value.find(item => item.id === id)
  if (!slug) {
    if (!existing) ipTypes.value = [...ipTypes.value, { id, slug: '', label: `未知类型（#${id}）` }]
    return
  }
  const label = labelForIpTypeSlug(slug)
  const clash = ipTypes.value.find(item => item.slug === slug && item.id !== id && slug !== FALLBACK_IP_TYPE_SLUG)
  let next = clash ? ipTypes.value.filter(item => item.id !== clash.id) : [...ipTypes.value]
  // 保底占位（id=0）在拿到真实观测后移除
  next = next.filter(item => item.id !== 0)
  if (next.some(item => item.id === id)) {
    next = next.map(item => (item.id === id ? { ...item, slug, label } : item))
  } else {
    next = [...next, { id, slug, label }]
  }
  ipTypes.value = next.sort((a, b) => a.id - b.id)
}

/** 列表查询条件 */
const keyword = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

interface CaseListPayload {
  items: AdminCaseItem[]
  meta: AdminPageMeta
}

const listKey = computed(() =>
  `admin-cases:${keyword.value.trim()}:${page.value}:${pageSize.value}`
)

async function fetchCasePage(targetPage: number): Promise<CaseListPayload> {
  const payload = await requestFetch<{ data?: AdminCaseItem[], meta?: Record<string, unknown> }>('/api/admin/cases', {
    query: toAdminQuery({
      keyword: keyword.value.trim(),
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
} = await useAsyncData<CaseListPayload>(
  listKey,
  async () => {
    const first = await fetchCasePage(page.value)
    // 服务端把越界页夹到最后一页；按其返回的页码再取一次，避免显示了错误的页。
    if (page.value > first.meta.totalPages && first.meta.totalPages >= 1) {
      const retry = await fetchCasePage(first.meta.totalPages)
      page.value = retry.meta.page
      return retry
    }
    return first
  },
  { watch: [listKey], default: defaultListPayload }
)

/** 未加载时的空载荷；总数与总页数一律等接口 meta，不自行估算。 */
function defaultListPayload(): CaseListPayload {
  return {
    items: [],
    meta: { page: page.value, pageSize: pageSize.value, total: 0, totalPages: 1 }
  }
}

// 侵权类型字典与案件列表并行加载：字典来自后台只读接口，不依赖列表结果。
const { error: ipTypeError } = await useAsyncData('admin-cases:ip-types', async () => loadIpTypes())

const items = computed(() => listData.value.items)
const meta = computed<AdminPageMeta>(() => listData.value.meta)
const isLoading = computed(() => listStatus.value === 'pending')
const listErrorMessage = computed(() => adminRequestErrorMessage(listError.value, '案例列表加载失败，请稍后重试'))

watch(keyword, () => { page.value = 1 }, { flush: 'sync' })

const notice = ref('')
const actionError = ref('')
const selectedCaseIds = ref<number[]>([])
const allVisibleSelected = computed(() => (
  items.value.some(item => item.publishStatus !== 'archived')
  && items.value.filter(item => item.publishStatus !== 'archived').every(item => selectedCaseIds.value.includes(item.id))
))
const selectedDraftCount = computed(() => items.value.filter(item => (
  selectedCaseIds.value.includes(item.id) && item.publishStatus === 'draft'
)).length)

watch([page, pageSize, keyword], () => { selectedCaseIds.value = [] })
watch(items, (nextItems) => {
  const visibleIds = new Set(nextItems.map(item => item.id))
  selectedCaseIds.value = selectedCaseIds.value.filter(id => visibleIds.has(id))
})

function isCaseSelected(id: number) {
  return selectedCaseIds.value.includes(id)
}

function toggleCaseSelection(item: AdminCaseItem, checked: boolean) {
  if (item.publishStatus === 'archived') return
  selectedCaseIds.value = checked
    ? [...new Set([...selectedCaseIds.value, item.id])]
    : selectedCaseIds.value.filter(id => id !== item.id)
}

function toggleVisibleSelection(checked: boolean) {
  const selectableIds = items.value.filter(item => item.publishStatus !== 'archived').map(item => item.id)
  selectedCaseIds.value = checked
    ? [...new Set([...selectedCaseIds.value, ...selectableIds])]
    : selectedCaseIds.value.filter(id => !selectableIds.includes(id))
}

/** 编辑器状态 */
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const saveError = ref('')
const detailLoading = ref(false)
const detailError = ref('')

/**
 * 表单容器引用 + 打开表单后滚动到表单区域。
 * 列表在上、表单在下，不滚动的话点「编辑」后视口仍停在列表，看起来像没反应。
 */
const editorRef = ref<HTMLElement | null>(null)
const { requestScrollToEditor } = useScrollToEditor(editorRef, { selector: '[data-scroll-target="case-editor"]' })

/**
 * 关联字段的「未触碰」追踪：只有被触碰过的关联才会出现在请求体里。
 * 接口语义：字段缺省 = 保留现状；显式 null = 清除关联。二者在界面上必须能区分。
 */
const touched = reactive({ brandId: false, lawFirmId: false, ipTypeId: false })

/** 侵权类型下拉的「不修改」哨兵值。 */
const IP_TYPE_UNCHANGED = '__unchanged__'

interface CaseForm {
  caseNumber: string
  filedAt: string
  plaintiff: string
  status: string
  publishStatus: string
  brandId: number | null
  brandName: string
  lawFirmId: number | null
  lawFirmName: string
  ipTypeId: string
}

const form = reactive<CaseForm>({
  caseNumber: '',
  filedAt: '',
  plaintiff: '',
  status: 'open',
  publishStatus: 'draft',
  brandId: null,
  brandName: '',
  lawFirmId: null,
  lawFirmName: '',
  ipTypeId: ''
})

/** 当前编辑案件原始的类型 slug，用于「不修改」时展示真实标签。 */
const originalCaseTypeSlug = ref('')

const filedAtError = computed(() => {
  const value = form.filedAt.trim()
  if (!value) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? '' : '起诉时间格式应为 YYYY-MM-DD'
})

const formValid = computed(() => !filedAtError.value)

/** 侵权类型下拉当前值：编辑且未触碰时为哨兵（不修改），新建时为 ''。 */
const ipTypeSelectValue = computed(() => {
  if (!touched.ipTypeId && editingId.value !== null) return IP_TYPE_UNCHANGED
  return form.ipTypeId
})

/** 侵权类型下拉当前展示的类型标签（与列表同一套 caseTypeLabel 口径）。 */
const ipTypeCurrentLabel = computed(() => {
  if (ipTypeSelectValue.value === IP_TYPE_UNCHANGED) return caseTypeLabel(originalCaseTypeSlug.value)
  if (ipTypeSelectValue.value === '') return UNKNOWN_CASE_TYPE_LABEL
  const option = ipTypes.value.find(item => String(item.id) === ipTypeSelectValue.value)
  return option ? option.label : caseTypeLabel(originalCaseTypeSlug.value)
})

function resetForm() {
  form.caseNumber = ''
  form.filedAt = ''
  form.plaintiff = ''
  form.status = 'open'
  form.publishStatus = 'draft'
  form.brandId = null
  form.brandName = ''
  form.lawFirmId = null
  form.lawFirmName = ''
  form.ipTypeId = ''
  originalCaseTypeSlug.value = ''
  touched.brandId = false
  touched.lawFirmId = false
  touched.ipTypeId = false
}

async function openCreate() {
  editingId.value = null
  resetForm()
  saveError.value = ''
  detailError.value = ''
  editorOpen.value = true
  requestScrollToEditor()
}

async function openEdit(item: AdminCaseItem) {
  editorOpen.value = true
  editingId.value = item.id
  resetForm()
  requestScrollToEditor()
  saveError.value = ''
  detailError.value = ''
  detailLoading.value = true
  // 先用列表行填充，详情返回后覆盖（避免详情请求期间表单是空白）。
  form.caseNumber = item.caseNumber
  form.filedAt = toDateValue(item.filedAt)
  form.plaintiff = item.plaintiff
  form.brandName = item.brand
  form.lawFirmName = item.lawFirm
  form.publishStatus = item.publishStatus || 'draft'
  form.status = item.status || 'open'
  originalCaseTypeSlug.value = item.caseType
  try {
    const detail = await requestAdminApi<{ case: AdminCaseDetail }>(`/api/admin/cases/${item.id}`, { requestFetch })
    const record = detail.case
    form.caseNumber = record.caseNumber
    form.filedAt = toDateValue(record.filedAt)
    form.plaintiff = record.plaintiff
    form.status = record.status || 'open'
    form.publishStatus = record.publishStatus || 'draft'
    form.brandId = record.brandId
    form.brandName = record.brand
    form.lawFirmId = record.lawFirmId
    form.lawFirmName = record.lawFirm
    originalCaseTypeSlug.value = record.caseType
    syncIpTypeFromObservation(record.ipTypeId, record.caseType)
    form.ipTypeId = record.ipTypeId === null ? '' : String(record.ipTypeId)
  } catch (error) {
    detailError.value = adminRequestErrorMessage(error, '案例详情加载失败，请稍后重试')
  } finally {
    detailLoading.value = false
  }
}

function closeEditor() {
  editorOpen.value = false
  editingId.value = null
  saveError.value = ''
  detailError.value = ''
}

/** 清除关联：显式发送 null（与「不修改」区分开）。 */
function clearRelation(field: 'brandId' | 'lawFirmId') {
  form[field] = null
  if (field === 'brandId') form.brandName = ''
  if (field === 'lawFirmId') form.lawFirmName = ''
  touched[field] = true
}

/** 品牌新建中（避免重复点击提交两次）。 */
const creatingBrand = ref(false)
/** 律所新建中（同上）。 */
const creatingLawFirm = ref(false)

/**
 * 用输入的名称新建品牌，并把当前案件关联到它。
 *
 * 需求：涉案品牌要能输入及搜索，搜不出来直接用输入的品牌，同时品牌表增加该品牌。
 *
 * 为什么在这里就落库、而不是「先记住名字、保存案件时一起建」：
 *   案件上有多个关联字段（品牌 / 律所 / 侵权类型），各自都可能新建。
 *   若都攒到保存时处理，一次失败就要回滚多个新建，用户也难以判断到底建成了什么。
 *   即时新建让每次操作结果都是确定的，且成功后能立刻拿到 id 正常关联。
 *   slug 由服务端按名称生成并保证唯一，这里不需要操心。
 */
async function createBrand(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  creatingBrand.value = true
  saveError.value = ''
  notice.value = ''
  try {
    const created = await requestAdminApi<{ id: number, slug: string }>(
      '/api/admin/brands',
      { method: 'POST', body: { name: trimmed }, requestFetch },
    )
    const id = Number(created?.id)
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('品牌创建成功但未返回有效 id')
    }
    form.brandId = id
    form.brandName = trimmed
    touched.brandId = true
    notice.value = `已新建品牌「${trimmed}」并关联到当前案件`
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '品牌新建失败，请稍后重试')
  } finally {
    creatingBrand.value = false
  }
}

/**
 * 用输入的名称新建律所，并把当前案件关联到它。
 * 需求：代理律所的填写搜索逻辑按涉案品牌来——即可搜索、搜不到直接新建。
 * 实现与 createBrand 对称，只有接口与字段不同。
 */
async function createLawFirm(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  creatingLawFirm.value = true
  saveError.value = ''
  notice.value = ''
  try {
    const created = await requestAdminApi<{ id: number, slug: string }>(
      '/api/admin/law-firms',
      { method: 'POST', body: { name: trimmed }, requestFetch },
    )
    const id = Number(created?.id)
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('律所创建成功但未返回有效 id')
    }
    form.lawFirmId = id
    form.lawFirmName = trimmed
    touched.lawFirmId = true
    notice.value = `已新建律所「${trimmed}」并关联到当前案件`
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '律所新建失败，请稍后重试')
  } finally {
    creatingLawFirm.value = false
  }
}

/** 保存：新建走 POST，编辑走 PUT；只有被触碰过的关联字段才会出现在请求体里。 */
async function onSubmit(publish = false) {
  if (!canWrite.value) {
    saveError.value = readOnlyReason
    return
  }
  if (!formValid.value) {
    saveError.value = filedAtError.value
    return
  }
  saving.value = true
  saveError.value = ''
  notice.value = ''
  actionError.value = ''

  const body: Record<string, unknown> = {
    caseNumber: form.caseNumber.trim(),
    filedAt: form.filedAt || '',
    plaintiff: form.plaintiff,
    status: form.status,
    publishStatus: publish ? 'published' : form.publishStatus
  }

  // 新建时关联一定一起写；编辑时只有触碰过才写（未触碰 = 请求里不带该字段 = 保留现状）。
  const isEdit = editingId.value !== null
  if (!isEdit || touched.brandId) body.brandId = form.brandId
  if (!isEdit || touched.lawFirmId) body.lawFirmId = form.lawFirmId
  if (!isEdit || touched.ipTypeId) body.ipTypeId = form.ipTypeId === '' ? null : Number(form.ipTypeId)

  try {
    if (isEdit) {
      await requestAdminApi<AdminWriteResult>(`/api/admin/cases/${editingId.value}`, { method: 'PUT', body, requestFetch })
      notice.value = publish ? '案例已发布' : '案例已保存'
    } else {
      await requestAdminApi<AdminWriteResult>('/api/admin/cases', { method: 'POST', body, requestFetch })
      notice.value = publish ? '案例已发布' : '案例已新建'
    }
    await refreshList()
    closeEditor()
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function onFormSubmit() { return onSubmit(false) }

/** 归档（软删除：publish_status 置为 archived，不物理删除数据） */
async function onArchive(item: AdminCaseItem) {
  if (!canWrite.value) return
  if (!window.confirm(`确认归档案件 ${item.caseNumber}？归档只会把公开状态改为「已归档」，数据仍保留在数据库中，不会物理删除。`)) return
  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`/api/admin/cases/${item.id}`, { method: 'DELETE', requestFetch })
    notice.value = `案件 ${item.caseNumber} 已归档（软删除，数据仍保留）`
    await refreshList()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '归档失败，请稍后重试')
  }
}

async function onPublishOne(item: AdminCaseItem) {
  if (!canWrite.value || item.publishStatus !== 'draft') return
  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`/api/admin/cases/${item.id}`, {
      method: 'PUT',
      body: { publishStatus: 'published' },
      requestFetch,
    })
    selectedCaseIds.value = selectedCaseIds.value.filter(id => id !== item.id)
    notice.value = `案件 ${item.caseNumber} 已发布`
    await refreshList()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '发布失败，请稍后重试')
  }
}

async function onPublishSelected() {
  if (!canWrite.value || selectedCaseIds.value.length === 0 || selectedDraftCount.value === 0) return
  if (!window.confirm(`确认发布已选案件中的 ${selectedDraftCount.value} 条草稿？`)) return
  actionError.value = ''
  notice.value = ''
  try {
    const result = await requestAdminApi<{ publishedCount: number, unchangedCount: number }>(
      '/api/admin/cases/bulk-publish',
      { method: 'POST', body: { ids: selectedCaseIds.value }, requestFetch },
    )
    notice.value = `已发布 ${result.publishedCount} 条案件${result.unchangedCount ? `，${result.unchangedCount} 条状态未变` : ''}`
    selectedCaseIds.value = []
    await refreshList()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '批量发布失败，请稍后重试')
  }
}

function onPageSize(next: number) {
  pageSize.value = next
  page.value = 1
}
</script>

<template>
  <PageContainer class="admin-cases" size="wide">
    <p v-if="!canWrite" class="admin-cases__readonly" role="note">{{ readOnlyReason }}</p>
    <p v-if="notice" class="admin-cases__notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="admin-cases__error" role="alert">{{ actionError }}</p>

    <form class="admin-cases__filters admin-cases__filter-form" role="search" @submit.prevent="page = 1">
        <div class="admin-cases__field">
          <label class="admin-cases__label" for="case-keyword">关键词</label>
          <input
            id="case-keyword"
            v-model="keyword"
            class="admin-cases__input"
            type="search"
            placeholder="案件号 / 原告 / 品牌 / 律所 / 法院"
          >
        </div>
        <BaseButton variant="secondary" size="sm" type="submit">搜索</BaseButton>
        <BaseButton
          type="button"
          :disabled="!canWrite"
          :title="canWrite ? undefined : readOnlyReason"
          @click="openCreate"
        >新建案例</BaseButton>
    </form>

    <section class="admin-cases__list" aria-label="案例列表" aria-live="polite">
      <template v-if="listError">
        <ErrorState title="案例列表加载失败" :message="listErrorMessage" @retry="refreshList" />
      </template>

      <template v-else>
        <p v-if="isLoading" class="admin-cases__loading" role="status">正在加载案例列表…</p>

        <div v-if="items.length" class="admin-cases__table-wrap">
          <div class="admin-cases__bulk-actions">
            <label class="admin-cases__select-page">
              <input
                type="checkbox"
                :checked="allVisibleSelected"
                :disabled="!canWrite || !items.some(item => item.publishStatus !== 'archived')"
                @change="toggleVisibleSelection(($event.target as HTMLInputElement).checked)"
              >
              全选本页
            </label>
            <span>已选 {{ selectedCaseIds.length }} 条</span>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="!canWrite || selectedDraftCount === 0"
              :title="canWrite ? undefined : readOnlyReason"
              @click="onPublishSelected"
            >
              发布已选草稿
            </BaseButton>
          </div>
          <table class="admin-cases__table">
            <caption class="admin-cases__caption">
              共 {{ meta.total }} 条案例，当前第 {{ meta.page }} / {{ meta.totalPages }} 页
            </caption>
            <thead>
              <tr>
                <th scope="col">选择</th>
                <th scope="col">案件号</th>
                <th scope="col">起诉时间</th>
                <th scope="col">代理律所</th>
                <th scope="col">原告</th>
                <th scope="col">涉案品牌</th>
                <th scope="col">侵权类型</th>
                <th scope="col">状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>
                  <input
                    type="checkbox"
                    :checked="isCaseSelected(item.id)"
                    :disabled="!canWrite || item.publishStatus === 'archived'"
                    :aria-label="`选择案件 ${item.caseNumber || item.id}`"
                    @change="toggleCaseSelection(item, ($event.target as HTMLInputElement).checked)"
                  >
                </td>
                <td>{{ item.caseNumber }}</td>
                <td>{{ item.filedAt || '未填写' }}</td>
                <td>{{ item.lawFirm || '未关联' }}</td>
                <td>{{ item.plaintiff || '未填写' }}</td>
                <td>{{ item.brand || '未关联' }}</td>
                <td>{{ caseTypeLabel(item.caseType) }}</td>
                <td>
                  <span class="admin-cases__status" :class="`admin-cases__status--${item.publishStatus || 'draft'}`">
                    {{ item.publishStatus === 'published' ? '已发布' : item.publishStatus === 'archived' ? '已归档' : '草稿' }}
                  </span>
                </td>
                <td class="admin-cases__cell-actions">
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
                    v-if="item.publishStatus === 'draft'"
                    variant="primary"
                    size="sm"
                    :disabled="!canWrite"
                    :title="canWrite ? undefined : readOnlyReason"
                    @click="onPublishOne(item)"
                  >
                    发布
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    :disabled="!canWrite || item.publishStatus === 'archived'"
                    :title="canWrite ? '归档为软删除，数据仍然保留' : readOnlyReason"
                    @click="onArchive(item)"
                  >
                    归档
                  </BaseButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="!isLoading" class="admin-cases__empty">
          <p class="admin-cases__empty-title">没有符合条件的案例</p>
          <p class="admin-cases__empty-desc">请调整关键词后重试。</p>
        </div>

        <AdminPager
          :page="meta.page"
          :total-pages="meta.totalPages"
          :total="meta.total"
          :page-size="meta.pageSize"
          noun="条案例"
          @update:page="page = $event"
          @update:page-size="onPageSize"
        />
      </template>
    </section>

    <!--
      ref 必须挂在原生元素上，不能挂在 BaseCard 这类组件上：
      组件上的 ref 拿到的是组件实例（没有 scrollIntoView），滚动静默失效。
    -->
    <div v-if="editorOpen" ref="editorRef" data-scroll-target="case-editor" class="admin-cases__editor">
      <BaseCard
        :title="editingId === null ? '新建案例' : `编辑案例 #${editingId}`"
        :title-level="2"
      >
      <p v-if="detailLoading" class="admin-cases__loading" role="status">正在加载案例详情…</p>
      <p v-if="detailError" class="admin-cases__error" role="alert">{{ detailError }}</p>

      <form class="admin-cases__form" novalidate @submit.prevent="onFormSubmit">
        <div class="admin-cases__grid">
          <div class="admin-cases__field admin-cases__identity-field">
            <label class="admin-cases__label" for="case-number">案件号（必填）</label>
            <input
              id="case-number"
              v-model="form.caseNumber"
              class="admin-cases__input"
              type="text"
              maxlength="64"
              :disabled="!canWrite"
            >
          </div>

          <div class="admin-cases__field admin-cases__identity-field">
            <label class="admin-cases__label" for="case-filed-at">起诉时间</label>
            <input
              id="case-filed-at"
              v-model="form.filedAt"
              class="admin-cases__input"
              type="date"
              :disabled="!canWrite"
              :aria-invalid="Boolean(filedAtError)"
            >
            <p v-if="filedAtError" class="admin-cases__hint admin-cases__hint--error">{{ filedAtError }}</p>
          </div>

          <div class="admin-cases__field admin-cases__identity-field">
            <label class="admin-cases__label" for="case-plaintiff">原告</label>
            <input id="case-plaintiff" v-model="form.plaintiff" class="admin-cases__input" type="text" maxlength="255" :disabled="!canWrite">
          </div>
        </div>

        <fieldset class="admin-cases__relations">
          <legend class="admin-cases__legend">关联信息</legend>

          <AdminRemoteSelect
            id="case-brand"
            endpoint="/api/admin/brands"
            label="涉案品牌"
            label-key="name"
            hint-key="nameEn"
            :model-value="form.brandId"
            :model-label="form.brandName"
            :disabled="!canWrite"
            allow-create
            :creating="creatingBrand"
            @update:model-value="form.brandId = $event; touched.brandId = true"
            @selected="form.brandName = $event?.label ?? ''"
            @create="createBrand"
            @error="saveError = $event"
          >
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="!canWrite || form.brandId === null"
              @click="clearRelation('brandId')"
            >
              清除品牌关联
            </BaseButton>
          </AdminRemoteSelect>

          <AdminRemoteSelect
            id="case-law-firm"
            endpoint="/api/admin/law-firms"
            label="代理律所"
            label-key="name"
            hint-key="nameEn"
            :model-value="form.lawFirmId"
            :model-label="form.lawFirmName"
            :disabled="!canWrite"
            allow-create
            :creating="creatingLawFirm"
            @update:model-value="form.lawFirmId = $event; touched.lawFirmId = true"
            @selected="form.lawFirmName = $event?.label ?? ''"
            @create="createLawFirm"
            @error="saveError = $event"
          >
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="!canWrite || form.lawFirmId === null"
              @click="clearRelation('lawFirmId')"
            >
              清除律所关联
            </BaseButton>
          </AdminRemoteSelect>

          <div class="admin-cases__field">
            <label class="admin-cases__label" for="case-ip-type">侵权类型</label>
            <select
              id="case-ip-type"
              v-model="form.ipTypeId"
              class="admin-cases__select"
              :disabled="!canWrite"
              @change="touched.ipTypeId = true"
            >
              <option v-if="editingId !== null" :value="IP_TYPE_UNCHANGED">不修改（保留现有类型）</option>
              <option value="">未选择 / 清除关联（发送 null）</option>
              <option v-for="item in ipTypes" :key="item.id" :value="String(item.id)">
                {{ item.label }}（{{ item.slug || '未知' }}）
              </option>
            </select>
          </div>
        </fieldset>

        <p v-if="saveError" class="admin-cases__error" role="alert">{{ saveError }}</p>
        <p v-if="!canWrite" class="admin-cases__readonly" role="note">{{ readOnlyReason }}</p>

        <div class="admin-cases__actions">
          <BaseButton
            type="submit"
            :disabled="!canWrite || !formValid || saving || detailLoading"
            :title="canWrite ? undefined : readOnlyReason"
          >
            {{ saving ? '保存中…' : '保存' }}
          </BaseButton>
          <BaseButton type="button" variant="secondary" :disabled="!canWrite || !formValid || saving || detailLoading" @click="onSubmit(true)">发布案例</BaseButton>
          <BaseButton variant="secondary" :disabled="saving" @click="closeEditor">取消</BaseButton>
        </div>
      </form>
      </BaseCard>
    </div>

  </PageContainer>
</template>

<style scoped>
.admin-cases {
  padding-block: var(--space-8) var(--space-16);
}

.admin-cases__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-cases__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-cases__readonly {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-cases__notice {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 10%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-cases__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-cases__filters,
.admin-cases__editor {
  margin-top: var(--space-6);
}

.admin-cases__filters {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
}

.admin-cases__filter-form {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
}

.admin-cases__filter-form .admin-cases__field { display: flex; flex: 1 1 auto; min-width: 0; gap: var(--space-3); }
.admin-cases__filter-form .admin-cases__label { flex: 0 0 auto; white-space: nowrap; }
.admin-cases__filter-form .admin-cases__input { flex: 1 1 auto; min-width: 0; }

@media (max-width: 520px) {
  .admin-cases__filter-form { flex-wrap: wrap; gap: var(--space-3); }
  .admin-cases__filter-form .admin-cases__field { flex: 1 1 100%; }
}

.admin-cases__field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.admin-cases__identity-field {
  grid-template-columns: 72px minmax(0, 1fr);
}

.admin-cases__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-cases__input,
.admin-cases__select,
.admin-cases__textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-cases__select {
  max-width: 420px;
}

.admin-cases__input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.admin-cases__input:disabled,
.admin-cases__select:disabled,
.admin-cases__textarea:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-cases__textarea {
  width: 100%;
  max-width: 720px;
  resize: vertical;
}

.admin-cases__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-cases__hint--error {
  color: var(--color-error);
}

.admin-cases__list {
  margin-top: var(--space-6);
}

.admin-cases__loading {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-cases__table-wrap {
  overflow-x: auto;
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.admin-cases__bulk-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.admin-cases__select-page {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  cursor: pointer;
}

.admin-cases__status {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 700;
  white-space: nowrap;
}

.admin-cases__status--draft {
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  color: var(--color-warning);
}

.admin-cases__status--published {
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}

.admin-cases__status--archived {
  background: var(--color-bg-light);
  color: var(--color-text-muted);
}

.admin-cases__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-cases__caption {
  padding: var(--space-3);
  text-align: left;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.admin-cases__table th,
.admin-cases__table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.admin-cases__table th {
  background-color: var(--color-bg-light);
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}

.admin-cases__cell-actions {
  display: flex;
  gap: var(--space-2);
  white-space: nowrap;
}

.admin-cases__empty {
  padding: var(--space-12) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.admin-cases__empty-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}

.admin-cases__empty-desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-cases__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-cases__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
}

.admin-cases__relations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.admin-cases__legend {
  padding: 0 var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}

.admin-cases__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

</style>
