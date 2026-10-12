<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { MediaAsset, UploadError } from '~/composables/useOssUpload'
import {
  ADMIN_PAGE_SIZE,
  adminRequestErrorMessage,
  toAdminQuery,
  toPageMeta,
  type AdminPageMeta
} from '~/utils/adminApi'
import { MEDIA_READ_ONLY_NOTICE, canWriteMedia } from '~/utils/adminPermission'
import {
  SOFT_DELETE_CONFIRM,
  SOFT_DELETE_NOTICE,
  USAGE_SCOPE_OPTIONS,
  formatCreatedAt,
  formatDimensions,
  isImageMimeType,
  usageScopeLabel
} from '~/utils/adminMedia'

/**
 * 媒体库（上传 + 列表 + 软删除）。
 *
 * 上传：后端不接收文件本体，浏览器先向 /api/admin/upload-policy 申请一次性凭证，
 * 再直传阿里云 OSS，最后调用 /api/admin/media 登记记录。
 * 列表：GET /api/admin/media（keyword / usageScope / page / pageSize / includeDeleted=1）。
 * 删除：DELETE /api/admin/media/{id}，只置 deleted_at（软删除），
 * 需要二次确认，成功后刷新列表。
 *
 * 权限：viewer 只读 —— 上传与删除控件全部禁用并给出中文说明，而不是等接口返回 403。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '媒体库',
  description: '后台媒体资源上传、检索与软删除。',
  robots: 'noindex, nofollow'
})

/** 列表项（GET /api/admin/media 的 item） */
interface MediaListItem {
  id: number
  objectKey: string
  publicUrl: string
  fileName: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  usageScope: string
  title: string
  createdAt: string
  deletedAt?: string | null
}

interface MediaListPayload {
  data?: MediaListItem[] | null
  meta?: { page?: unknown, pageSize?: unknown, total?: unknown, totalPages?: unknown } | null
}

interface MediaListData {
  items: MediaListItem[]
  meta: AdminPageMeta
}

/**
 * 上一次上传策略下发的白名单 MIME。
 * 首次打开页面时只能给出静态提示，上传过一次后即可用服务端真实白名单
 * 收紧文件选择器；真正的校验始终在服务端。
 */
const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

const requestFetch = useRequestFetch()
const { user } = useAdminSession()
const { upload, uploading, progress } = useOssUpload()

/** 只读角色（viewer）禁用上传与删除 */
const canManage = computed(() => canWriteMedia(user.value?.roles))

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const usageScope = ref('general')
const title = ref('')
const result = ref<MediaAsset | null>(null)
const errorMessage = ref('')
/** 服务端上一次下发的允许上传类型（未上传过时为空） */
const allowedMimeTypes = ref<string[]>([])

/** 文件选择器的 accept：优先使用服务端白名单 */
const accept = computed(() =>
  allowedMimeTypes.value.length ? allowedMimeTypes.value.join(',') : DEFAULT_ACCEPT
)

/** 结果面板展示的地址：publicUrl 缺失时退回 objectKey */
const resultLocation = computed(() => result.value?.publicUrl || result.value?.objectKey || '')

/** 结果面板展示的文件大小 */
const resultSize = computed(() => (result.value ? formatBytes(result.value.byteSize) : ''))

const canSubmit = computed(() => Boolean(file.value) && !uploading.value && canManage.value)

/** 选择文件：清空上一次的结果与错误，避免新旧信息混在一起 */
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  result.value = null
  errorMessage.value = ''
}

/** 重新选择文件并清空表单状态 */
function resetForm() {
  file.value = null
  title.value = ''
  result.value = null
  errorMessage.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
    fileInput.value.focus()
  }
}

// ---------------------------------------------------------------------------
// 媒体列表
// ---------------------------------------------------------------------------

/** 输入框里的关键词（提交后才生效） */
const keywordInput = ref('')
/** 已生效的筛选条件 */
const keyword = ref('')
const usageScopeFilter = ref('')
const includeDeleted = ref(false)
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

const deletingId = ref(0)
const pendingDeleteId = ref(0)
const listSuccess = ref('')
const listFailure = ref('')
/** 缩略图加载失败的行（回退为占位说明） */
const brokenThumbs = reactive<Record<number, boolean>>({})

const {
  data: listData,
  status: loadStatus,
  error: listError,
  refresh: refreshList
} = await useAsyncData<MediaListData>(
  () => `admin-media:${keyword.value}:${usageScopeFilter.value}:${includeDeleted.value ? 1 : 0}:${page.value}:${pageSize.value}`,
  async () => {
    const payload = await requestFetch<MediaListPayload>('/api/admin/media', {
      query: toAdminQuery({
        keyword: keyword.value,
        usageScope: usageScopeFilter.value,
        includeDeleted: includeDeleted.value ? 1 : undefined,
        page: page.value,
        pageSize: pageSize.value
      })
    })
    return {
      items: Array.isArray(payload?.data) ? payload.data : [],
      meta: toPageMeta(payload?.meta ?? undefined, { page: page.value, pageSize: pageSize.value })
    }
  },
  {
    default: (): MediaListData => ({
      items: [],
      meta: { page: 1, pageSize: ADMIN_PAGE_SIZE, total: 0, totalPages: 1 }
    }),
    watch: [keyword, usageScopeFilter, includeDeleted, page, pageSize]
  }
)

const mediaItems = computed(() => listData.value?.items ?? [])
const listMeta = computed(() => listData.value?.meta ?? { page: 1, pageSize: ADMIN_PAGE_SIZE, total: 0, totalPages: 1 })
const isListPending = computed(() => loadStatus.value === 'pending')
const listErrorMessage = computed(() => adminRequestErrorMessage(listError.value, '媒体列表加载失败，请稍后重试'))

/** 筛选条件变化回到第 1 页 */
watch([keyword, usageScopeFilter, includeDeleted, pageSize], () => { page.value = 1 }, { flush: 'sync' })

/** 服务端把越界页夹到最后一页，客户端跟随修正 */
if (import.meta.client) {
  watch(listData, (value) => {
    if (value && page.value > value.meta.totalPages) page.value = value.meta.page
  })
}

function applyKeyword() {
  listSuccess.value = ''
  listFailure.value = ''
  keyword.value = keywordInput.value.trim()
}

function resetFilters() {
  keywordInput.value = ''
  keyword.value = ''
  usageScopeFilter.value = ''
  includeDeleted.value = false
  page.value = 1
}

/** 缩略图是否可预览（非图片、地址为空或已加载失败时回退占位） */
function canPreview(row: MediaListItem): boolean {
  return Boolean(row.publicUrl) && isImageMimeType(row.mimeType) && !brokenThumbs[row.id]
}

function markThumbBroken(id: number) {
  brokenThumbs[id] = true
}

function thumbFallbackText(row: MediaListItem): string {
  if (!row.publicUrl) return '无预览地址'
  if (!isImageMimeType(row.mimeType)) return '非图片文件'
  return '缩略图加载失败'
}

function askDelete(row: MediaListItem) {
  if (!canManage.value) return
  listSuccess.value = ''
  listFailure.value = ''
  pendingDeleteId.value = row.id
}

function cancelDelete() {
  pendingDeleteId.value = 0
}

/** 确认软删除：只置 deleted_at，成功后刷新列表 */
async function confirmDelete(row: MediaListItem) {
  if (!canManage.value || deletingId.value !== 0) return
  deletingId.value = row.id
  listSuccess.value = ''
  listFailure.value = ''
  try {
    await requestFetch(`/api/admin/media/${row.id}`, { method: 'DELETE' })
    listSuccess.value = `已标记为删除：${row.objectKey || row.fileName || `#${row.id}`}（软删除，不会从对象存储移除文件）。`
    pendingDeleteId.value = 0
    await refreshList()
  } catch (cause) {
    listFailure.value = adminRequestErrorMessage(cause, '删除媒体失败，请稍后重试')
  } finally {
    deletingId.value = 0
  }
}

/** 提交上传 */
async function onSubmit() {
  if (!file.value || uploading.value || !canManage.value) return
  errorMessage.value = ''
  result.value = null
  listSuccess.value = ''
  try {
    result.value = await upload(file.value, {
      usageScope: usageScope.value,
      ...(title.value.trim() ? { title: title.value.trim() } : {}),
      // 用服务端真实白名单收紧下一次的文件选择器
      onPolicy: (policy) => {
        allowedMimeTypes.value = Array.isArray(policy.allowedMimeTypes)
          ? policy.allowedMimeTypes
          : []
      }
    })
    await showNewestMedia()
  } catch (cause) {
    const failure = cause as UploadError
    errorMessage.value = failure?.message || '上传失败，请稍后重试'
  }
}

/**
 * 上传成功后让新文件可见：清空筛选并回到第 1 页（列表按 created_at DESC 排序）。
 * 如果本来就在默认视图下，则显式刷新一次。
 */
async function showNewestMedia() {
  const alreadyDefault = page.value === 1
    && !keyword.value
    && !usageScopeFilter.value
    && !includeDeleted.value
  keywordInput.value = ''
  keyword.value = ''
  usageScopeFilter.value = ''
  includeDeleted.value = false
  page.value = 1
  listSuccess.value = '媒体列表已刷新：已清空筛选并回到第 1 页，最新上传的文件显示在最前面。'
  if (alreadyDefault) await refreshList()
}
</script>

<template>
  <PageContainer class="admin-media" size="wide">
    <header class="admin-media__head">
      <h1 class="admin-media__title">媒体库</h1>
      <p class="admin-media__desc">
        上传图片与 PDF 附件，并管理（检索、软删除）已有资源。
        文件由浏览器直传对象存储，服务器只负责签名与登记记录。
      </p>
    </header>

    <p v-if="!canManage" class="admin-media__notice" role="note">{{ MEDIA_READ_ONLY_NOTICE }}</p>

    <BaseCard class="admin-media__card" title="上传媒体" :title-level="2">
      <form class="admin-media__form" novalidate @submit.prevent="onSubmit">
        <div class="admin-media__field">
          <label class="admin-media__label" for="media-file">选择文件（必填）</label>
          <input
            id="media-file"
            ref="fileInput"
            class="admin-media__input"
            type="file"
            name="file"
            :accept="accept"
            :disabled="uploading || !canManage"
            required
            aria-describedby="media-file-hint"
            @change="onFileChange"
          >
          <p id="media-file-hint" class="admin-media__hint">
            支持 JPG / PNG / WebP / GIF 图片；用途选择“文章配图”时额外支持 PDF。
            不允许 SVG（存在脚本注入风险），大小上限以服务端配置为准。
          </p>
        </div>

        <div class="admin-media__field">
          <label class="admin-media__label" for="media-usage">用途</label>
          <select
            id="media-usage"
            v-model="usageScope"
            class="admin-media__select"
            name="usageScope"
            :disabled="uploading || !canManage"
          >
            <option v-for="item in USAGE_SCOPE_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}（{{ item.value }}）
            </option>
          </select>
        </div>

        <div class="admin-media__field">
          <label class="admin-media__label" for="media-title">标题（可选）</label>
          <input
            id="media-title"
            v-model="title"
            class="admin-media__input"
            type="text"
            name="title"
            maxlength="120"
            :disabled="uploading || !canManage"
            placeholder="例如：首页品牌 Logo"
          >
        </div>

        <div class="admin-media__actions">
          <BaseButton type="submit" :disabled="!canSubmit">
            {{ uploading ? '上传中…' : '开始上传' }}
          </BaseButton>
          <BaseButton variant="secondary" :disabled="uploading || !canManage" @click="resetForm">
            重置
          </BaseButton>
          <span v-if="!canManage" class="admin-media__readonly-hint">只读角色：上传功能已禁用。</span>
        </div>
      </form>

      <div v-if="uploading || progress > 0" class="admin-media__progress">
        <p id="media-progress-label" class="admin-media__progress-text" aria-live="polite">
          上传进度：{{ progress }}%
        </p>
        <div
          class="admin-media__progress-track"
          role="progressbar"
          aria-labelledby="media-progress-label"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progress"
        >
          <div class="admin-media__progress-bar" :style="{ width: `${progress}%` }" />
        </div>
      </div>

      <p v-if="errorMessage" class="admin-media__error" role="alert">{{ errorMessage }}</p>
    </BaseCard>

    <BaseCard
      v-if="result"
      class="admin-media__card admin-media__card--success"
      title="上传成功"
      :title-level="2"
      role="status"
    >
      <dl class="admin-media__result">
        <div class="admin-media__result-row">
          <dt>访问地址</dt>
          <dd>
            <a :href="resultLocation" target="_blank" rel="noopener noreferrer">{{ resultLocation }}</a>
            <span v-if="!result.publicUrl" class="admin-media__result-note">
              （服务端未返回公开地址，此处为对象 Key）
            </span>
          </dd>
        </div>
        <div class="admin-media__result-row">
          <dt>媒体 ID</dt>
          <dd>{{ result.id }}</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>文件大小</dt>
          <dd>{{ resultSize }}（{{ result.byteSize }} 字节）</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>MIME 类型</dt>
          <dd>{{ result.mimeType }}</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>用途</dt>
          <dd>{{ result.usageScope }}</dd>
        </div>
      </dl>
    </BaseCard>

    <BaseCard class="admin-media__card" title="媒体列表" :title-level="2">
      <p class="admin-media__hint">
        {{ SOFT_DELETE_NOTICE }}勾选「显示已删除」可以查看已标记删除的记录。
      </p>

      <form class="admin-media__filters" role="search" @submit.prevent="applyKeyword">
        <div class="admin-media__field">
          <label class="admin-media__label" for="media-keyword">关键词</label>
          <input
            id="media-keyword"
            v-model="keywordInput"
            class="admin-media__input"
            type="search"
            placeholder="对象 Key / 标题 / 文件名"
          >
        </div>

        <div class="admin-media__field">
          <label class="admin-media__label" for="media-scope-filter">用途</label>
          <select id="media-scope-filter" v-model="usageScopeFilter" class="admin-media__select">
            <option value="">全部用途</option>
            <option v-for="item in USAGE_SCOPE_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}（{{ item.value }}）
            </option>
          </select>
        </div>

        <div class="admin-media__field admin-media__field--check">
          <input id="media-include-deleted" v-model="includeDeleted" type="checkbox">
          <label class="admin-media__label" for="media-include-deleted">显示已删除</label>
        </div>

        <div class="admin-media__field admin-media__field--action">
          <BaseButton size="sm" type="submit">查询</BaseButton>
          <BaseButton size="sm" variant="secondary" @click="resetFilters">重置</BaseButton>
        </div>
      </form>

      <p v-if="listSuccess" class="admin-media__success" role="status">{{ listSuccess }}</p>
      <p v-if="listFailure" class="admin-media__error" role="alert">{{ listFailure }}</p>

      <ErrorState
        v-if="listError"
        title="媒体列表加载失败"
        :message="listErrorMessage"
        @retry="refreshList"
      />

      <template v-else>
        <p class="admin-media__summary">
          共 {{ listMeta.total }} 个媒体资源（第 {{ listMeta.page }} / {{ listMeta.totalPages }} 页）
        </p>
        <p v-if="isListPending" class="admin-media__pending" role="status">正在加载媒体列表…</p>
        <p v-else-if="mediaItems.length === 0" class="admin-media__empty" role="status">
          当前筛选条件下没有媒体资源。可以清空关键词或勾选「显示已删除」后再试。
        </p>

        <ul v-else class="admin-media__list">
          <li v-for="row in mediaItems" :key="row.id" class="admin-media__row">
            <div class="admin-media__thumb">
              <img
                v-if="canPreview(row)"
                class="admin-media__thumb-img"
                :src="row.publicUrl"
                :alt="`媒体预览：${row.title || row.fileName || row.objectKey}`"
                loading="lazy"
                @error="markThumbBroken(row.id)"
              >
              <span v-else class="admin-media__thumb-fallback">{{ thumbFallbackText(row) }}</span>
            </div>

            <div class="admin-media__info">
              <p class="admin-media__object-key">{{ row.objectKey || '（无对象 Key）' }}</p>
              <p v-if="row.title" class="admin-media__row-title">标题：{{ row.title }}</p>

              <dl class="admin-media__facts">
                <div class="admin-media__fact">
                  <dt>类型</dt>
                  <dd>{{ row.mimeType || '未知' }}</dd>
                </div>
                <div class="admin-media__fact">
                  <dt>大小</dt>
                  <dd>{{ formatBytes(row.byteSize) }}</dd>
                </div>
                <div class="admin-media__fact">
                  <dt>尺寸</dt>
                  <dd>{{ formatDimensions(row.width, row.height) || '—' }}</dd>
                </div>
                <div class="admin-media__fact">
                  <dt>用途</dt>
                  <dd>{{ usageScopeLabel(row.usageScope) }}（{{ row.usageScope || '未设置' }}）</dd>
                </div>
                <div class="admin-media__fact">
                  <dt>创建时间</dt>
                  <dd>{{ formatCreatedAt(row.createdAt) }}</dd>
                </div>
                <div class="admin-media__fact">
                  <dt>文件名称</dt>
                  <dd>{{ row.fileName || '—' }}</dd>
                </div>
              </dl>

              <p v-if="row.deletedAt" class="admin-media__deleted" role="status">
                已于 {{ formatCreatedAt(row.deletedAt) }} 标记为删除（软删除，文件仍在对象存储中）。
              </p>
            </div>

            <div class="admin-media__row-actions">
              <p v-if="!canManage" class="admin-media__readonly-hint" role="note">
                只读角色：删除按钮已禁用。
              </p>

              <template v-if="row.deletedAt">
                <span class="admin-media__deleted-tag">已删除</span>
              </template>

              <template v-else-if="pendingDeleteId === row.id">
                <p class="admin-media__confirm-text">{{ SOFT_DELETE_CONFIRM }}</p>
                <div class="admin-media__confirm-actions">
                  <BaseButton
                    size="sm"
                    :disabled="!canManage || deletingId === row.id"
                    @click="confirmDelete(row)"
                  >
                    {{ deletingId === row.id ? '处理中…' : '确认删除' }}
                  </BaseButton>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    :disabled="deletingId === row.id"
                    @click="cancelDelete"
                  >
                    取消
                  </BaseButton>
                </div>
              </template>

              <template v-else>
                <BaseButton size="sm" variant="secondary" :disabled="!canManage" @click="askDelete(row)">
                  删除
                </BaseButton>
              </template>
            </div>
          </li>
        </ul>

        <AdminPager
          :page="listMeta.page"
          :total-pages="listMeta.totalPages"
          :total="listMeta.total"
          :page-size="listMeta.pageSize"
          noun="个媒体资源"
          :page-sizes="[20, 48]"
          @update:page="page = $event"
          @update:page-size="pageSize = $event"
        />
      </template>
    </BaseCard>

  </PageContainer>
</template>

<style scoped>
.admin-media {
  padding-block: var(--space-8) var(--space-16);
}

.admin-media__head {
  margin-bottom: var(--space-6);
}

.admin-media__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-media__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__notice {
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-media__card {
  margin-top: var(--space-6);
}

.admin-media__card--success {
  border-color: var(--color-success);
}

.admin-media__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-media__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-media__field--check {
  flex-direction: row;
  align-items: center;
}

.admin-media__field--action {
  flex-direction: row;
  align-items: center;
  gap: var(--space-3);
}

.admin-media__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-media__input,
.admin-media__select {
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-media__select {
  max-width: 320px;
}

.admin-media__input:disabled,
.admin-media__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-media__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.admin-media__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.admin-media__readonly-hint {
  color: var(--color-warning);
  font-size: var(--text-xs);
}

.admin-media__progress {
  margin-top: var(--space-5);
}

.admin-media__progress-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__progress-track {
  margin-top: var(--space-2);
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  border: 1px solid var(--color-border);
}

.admin-media__progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  transition: width var(--transition-base);
}

.admin-media__error,
.admin-media__success {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.admin-media__error {
  border: 1px solid var(--color-error);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
}

.admin-media__success {
  border: 1px solid var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
}

.admin-media__result {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-media__result-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.admin-media__result-row dt {
  min-width: 6em;
  color: var(--color-text-muted);
}

.admin-media__result-row dd {
  margin: 0;
  color: var(--color-text);
  word-break: break-all;
}

.admin-media__result-note {
  color: var(--color-warning);
}

.admin-media__filters {
  margin-top: var(--space-4);
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.admin-media__filters .admin-media__field {
  min-width: 200px;
}

.admin-media__filters .admin-media__field--check,
.admin-media__filters .admin-media__field--action {
  min-width: 0;
}

.admin-media__summary {
  margin-top: var(--space-5);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__pending,
.admin-media__empty {
  margin-top: var(--space-4);
  padding: var(--space-6);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.admin-media__list {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-media__row {
  display: grid;
  grid-template-columns: 120px 1fr 220px;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-page);
}

.admin-media__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 90px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
}

.admin-media__thumb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.admin-media__thumb-fallback {
  padding: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  text-align: center;
}

.admin-media__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-media__object-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--text-sm);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.admin-media__row-title {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__facts {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
}

.admin-media__fact {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.admin-media__fact dt {
  color: var(--color-text-muted);
}

.admin-media__fact dd {
  margin: 0;
  color: var(--color-text);
}

.admin-media__deleted {
  font-size: var(--text-xs);
  color: var(--color-warning);
}

.admin-media__row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.admin-media__confirm-text {
  font-size: var(--text-xs);
  color: var(--color-warning);
  line-height: var(--leading-relaxed);
}

.admin-media__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-media__deleted-tag {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}


@media (max-width: 1023px) {
  .admin-media__row {
    grid-template-columns: 1fr;
  }
}
</style>
