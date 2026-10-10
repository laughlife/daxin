<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ADMIN_PAGE_SIZE,
  adminRequestErrorMessage,
  toAdminQuery,
  toPageMeta,
  type AdminPageMeta
} from '~/utils/adminApi'
import { REVIEW_READ_ONLY_NOTICE, canWriteReview } from '~/utils/adminAccess'
import {
  APPLY_CASE_FIELD_LABELS,
  APPLY_CONFLICT_EXPLANATION,
  REVIEW_ENTITY_TYPE_OPTIONS,
  REVIEW_STATUS_OPTIONS,
  confidencePercent,
  confidenceText,
  conflictTitle,
  defaultApplyValue,
  entityTypeLabel,
  fieldNameLabel,
  isLowConfidence,
  isTargetResolutionConflict,
  reviewStatusLabel,
  sourceLabel,
  supportsCaseApply
} from '~/utils/adminReview'
import { apiErrorCode, httpStatusOf } from '~/utils/publicApi'

/**
 * 核验队列页。
 *
 * 取数：GET /api/admin/review（按 status / entityType / page / pageSize 过滤，服务端按
 * confidence ASC, id ASC 排序，最不确定的排在最前）。
 * 处理：PUT /api/admin/review/{id}。`applyValue` 只在服务端白名单的两组组合上被接受
 * （case + plaintiff → cases.plaintiff；case + filedAt → cases.filed_at）。
 *
 * 关键约束：核验项通过 case_sources 关联案件，一条旧库来源可能对应多起案件，
 * 因此服务端「唯一命中才回填」，命中 0 条或多条返回 409 且不修改核验项。
 * 页面必须把 409 当作可解释的业务冲突单独展示（不重试、不当普通报错）。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '核验队列',
  description: '人工核验迁移阶段置信度较低的数据项。',
  robots: 'noindex, nofollow'
})

interface ReviewItem {
  id: number
  entityType: string
  legacySourceTable: string
  legacySourceId: number
  fieldName: string
  candidateValue: string
  normalizedValue: string
  contextSnippet: string
  confidence: number
  status: string
  resolvedAt: string
  resolutionNote: string
}

interface ReviewListPayload {
  data?: ReviewItem[] | null
  meta?: { page?: unknown, pageSize?: unknown, total?: unknown, totalPages?: unknown } | null
}

interface ReviewListData {
  items: ReviewItem[]
  meta: AdminPageMeta
}

/** 409 冲突（回填目标无法唯一确定）的展示状态 */
interface ResolveConflict {
  itemId: number
  code: string
  message: string
}

/** 每条核验项的编辑态（备注 / 是否回填 / 回填值） */
interface ReviewDraft {
  note: string
  applyChecked: boolean
  applyValue: string
}

const requestFetch = useRequestFetch()
const { user } = useAdminSession()

const statusFilter = ref('open')
const entityTypeFilter = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

/** 只读角色（viewer）禁用全部写操作，并展示中文说明 */
const canResolve = computed(() => canWriteReview(user.value?.roles))

const drafts = ref<Record<number, ReviewDraft>>({})
const resolvingId = ref(0)
const successMessage = ref('')
const failureMessage = ref('')
const conflict = ref<ResolveConflict | null>(null)

function createDraft(item: ReviewItem): ReviewDraft {
  return {
    note: '',
    applyChecked: false,
    applyValue: defaultApplyValue(item.fieldName, item.candidateValue)
  }
}

/** 读取（必要时创建）某条核验项的编辑态；正常流程由下方 watch 预先创建 */
function draftOf(item: ReviewItem): ReviewDraft {
  const existing = drafts.value[item.id]
  if (existing) return existing
  const created = createDraft(item)
  drafts.value[item.id] = created
  return created
}

const { data, status: loadStatus, error, refresh } = await useAsyncData<ReviewListData>(
  () => `admin-review:${statusFilter.value}:${entityTypeFilter.value}:${page.value}:${pageSize.value}`,
  async () => {
    const payload = await requestFetch<ReviewListPayload>('/api/admin/review', {
      query: toAdminQuery({
        status: statusFilter.value,
        entityType: entityTypeFilter.value,
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
    default: (): ReviewListData => ({
      items: [],
      meta: { page: 1, pageSize: ADMIN_PAGE_SIZE, total: 0, totalPages: 1 }
    }),
    watch: [statusFilter, entityTypeFilter, page, pageSize]
  }
)

const items = computed(() => data.value?.items ?? [])
const meta = computed(() => data.value?.meta ?? { page: 1, pageSize: ADMIN_PAGE_SIZE, total: 0, totalPages: 1 })
const isPending = computed(() => loadStatus.value === 'pending')
const errorMessage = computed(() => adminRequestErrorMessage(error.value, '核验队列加载失败，请稍后重试'))

// 列表变化时重建编辑态：复用同 id 的草稿，丢弃已不在列表中的项。
watch(items, (list) => {
  const next: Record<number, ReviewDraft> = {}
  for (const item of list) {
    next[item.id] = drafts.value[item.id] ?? createDraft(item)
  }
  drafts.value = next
}, { immediate: true })

// 筛选条件变化回到第 1 页
watch([statusFilter, entityTypeFilter, pageSize], () => { page.value = 1 }, { flush: 'sync' })

// 服务端会把越界页夹到最后一页，客户端跟随修正页码
if (import.meta.client) {
  watch(data, (value) => {
    if (value && page.value > value.meta.totalPages) page.value = value.meta.page
  })
}

/** 该核验项是否允许回填（仅 case + plaintiff / filedAt 两组组合） */
function supportsApply(item: ReviewItem): boolean {
  return supportsCaseApply(item.entityType, item.fieldName)
}

function applyFieldLabel(item: ReviewItem): string {
  return APPLY_CASE_FIELD_LABELS[item.fieldName] ?? item.fieldName
}

/** 确认按钮是否可用：勾选回填且字段为原告时，回填值不能为空 */
function canConfirm(item: ReviewItem): boolean {
  if (!canResolve.value) return false
  const draft = drafts.value[item.id]
  if (!draft || !supportsApply(item) || !draft.applyChecked) return true
  if (item.fieldName === 'filedAt') return true // 空值表示清空立案日期
  return draft.applyValue.trim().length > 0
}

function resetMessages() {
  successMessage.value = ''
  failureMessage.value = ''
  conflict.value = null
}

/** 提交处理结果（确认 / 驳回），可选地把确认值回填到案件 */
async function resolveItem(item: ReviewItem, next: 'confirmed' | 'rejected') {
  if (!canResolve.value || resolvingId.value !== 0) return
  const draft = draftOf(item)
  resetMessages()
  resolvingId.value = item.id

  const wantsApply = next === 'confirmed' && supportsApply(item) && draft.applyChecked
  const body: Record<string, unknown> = { status: next }
  const note = draft.note.trim()
  if (note) body.resolutionNote = note
  if (wantsApply) body.applyValue = draft.applyValue.trim()

  try {
    const response = await requestFetch<{
      data: { item: ReviewItem, applied: false | { entity: string, id: number, column: string } }
    }>(`/api/admin/review/${item.id}`, { method: 'PUT', body })

    const applied = response?.data?.applied
    if (next === 'confirmed') {
      successMessage.value = applied
        ? `核验项 #${item.id} 已确认，并已回填到案件（${applied.entity} #${applied.id} · ${applied.column}）。`
        : `核验项 #${item.id} 已确认；本次仅记录核验状态，未回填业务数据。`
    } else {
      successMessage.value = `核验项 #${item.id} 已驳回。`
    }
    await refresh()
  } catch (cause) {
    const statusCode = httpStatusOf(cause)
    const code = apiErrorCode(cause)
    if (isTargetResolutionConflict(statusCode, code)) {
      // 409：服务端已放弃回填且未改动核验项，这里只解释原因，不提供重试入口。
      conflict.value = {
        itemId: item.id,
        code,
        message: adminRequestErrorMessage(cause, '服务端拒绝回填该核验项。')
      }
      await refresh()
    } else {
      failureMessage.value = adminRequestErrorMessage(cause, '保存核验结果失败，请稍后重试')
    }
  } finally {
    resolvingId.value = 0
  }
}

function resetFilters() {
  statusFilter.value = 'open'
  entityTypeFilter.value = ''
  page.value = 1
}
</script>

<template>
  <PageContainer class="admin-review" size="wide">
    <header class="admin-review__head">
      <h1 class="admin-review__title">核验队列</h1>
      <p class="admin-review__desc">
        迁移阶段产生的待人工确认数据。列表按置信度升序排列，最不确定的记录排在最前面。
      </p>
    </header>

    <p v-if="!canResolve" class="admin-review__notice" role="note">
      {{ REVIEW_READ_ONLY_NOTICE }}
    </p>

    <BaseCard class="admin-review__filters" title="筛选" :title-level="2">
      <form class="admin-review__form" @submit.prevent>
        <div class="admin-review__field">
          <label class="admin-review__label" for="review-status">核验状态</label>
          <select id="review-status" v-model="statusFilter" class="admin-review__select">
            <option v-for="option in REVIEW_STATUS_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="admin-review__field">
          <label class="admin-review__label" for="review-entity">实体类型</label>
          <select id="review-entity" v-model="entityTypeFilter" class="admin-review__select">
            <option v-for="option in REVIEW_ENTITY_TYPE_OPTIONS" :key="option.value || 'all'" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="admin-review__field admin-review__field--action">
          <BaseButton variant="secondary" size="sm" @click="resetFilters">重置筛选</BaseButton>
        </div>
      </form>
    </BaseCard>

    <p v-if="successMessage" class="admin-review__success" role="status">{{ successMessage }}</p>
    <p v-if="failureMessage" class="admin-review__error" role="alert">{{ failureMessage }}</p>

    <section v-if="conflict" class="admin-review__conflict" role="alert" aria-labelledby="review-conflict-title">
      <h2 id="review-conflict-title" class="admin-review__conflict-title">
        无法回填到案件：{{ conflictTitle(conflict.code) }}
      </h2>
      <p class="admin-review__conflict-message">{{ conflict.message }}</p>
      <p>{{ APPLY_CONFLICT_EXPLANATION }}</p>
      <p class="admin-review__conflict-path">
        核验项 #{{ conflict.itemId }} 仍为「待处理」，队列数据未被改动。请前往
        <NuxtLink to="/admin/cases">案件管理</NuxtLink>
        手动修正对应案件后，再回到本页重新处理。
      </p>
    </section>

    <ErrorState
      v-if="error"
      title="核验队列加载失败"
      :message="errorMessage"
      @retry="refresh"
    />

    <template v-else>
      <p class="admin-review__summary">
        共 {{ meta.total }} 条核验项（第 {{ meta.page }} / {{ meta.totalPages }} 页）
      </p>
      <p v-if="isPending" class="admin-review__pending" role="status">正在加载核验队列…</p>
      <p v-else-if="items.length === 0" class="admin-review__empty" role="status">
        当前筛选条件下没有核验项。可以切换「核验状态」查看已确认或已驳回的记录。
      </p>

      <ul v-else class="admin-review__list">
        <li v-for="item in items" :key="item.id">
          <BaseCard class="admin-review__item">
            <header class="admin-review__item-head">
              <h2 class="admin-review__item-title">
                #{{ item.id }} · {{ entityTypeLabel(item.entityType) }}
              </h2>
              <span
                class="admin-review__status"
                :class="`admin-review__status--${item.status || 'unknown'}`"
              >
                {{ reviewStatusLabel(item.status) }}
              </span>
            </header>

            <dl class="admin-review__meta">
              <div class="admin-review__meta-row">
                <dt>实体类型</dt>
                <dd>{{ entityTypeLabel(item.entityType) }}（{{ item.entityType || '未知' }}）</dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>字段</dt>
                <dd>{{ fieldNameLabel(item.fieldName) }}</dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>候选值</dt>
                <dd class="admin-review__value">{{ item.candidateValue || '（空）' }}</dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>上下文片段</dt>
                <dd class="admin-review__context">{{ item.contextSnippet || '（无上下文片段）' }}</dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>置信度</dt>
                <dd class="admin-review__confidence">
                  <span
                    class="admin-review__confidence-text"
                    :class="{ 'admin-review__confidence-text--low': isLowConfidence(item.confidence) }"
                  >
                    {{ confidenceText(item.confidence) }}
                  </span>
                  <span class="admin-review__confidence-bar" aria-hidden="true">
                    <span
                      class="admin-review__confidence-fill"
                      :class="{ 'admin-review__confidence-fill--low': isLowConfidence(item.confidence) }"
                      :style="{ width: `${confidencePercent(item.confidence)}%` }"
                    />
                  </span>
                  <span v-if="isLowConfidence(item.confidence)" class="admin-review__confidence-warn">
                    低置信度（&lt; 50%），建议人工核对原文
                  </span>
                </dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>来源</dt>
                <dd>{{ sourceLabel(item.legacySourceTable, item.legacySourceId) }}</dd>
              </div>
              <div class="admin-review__meta-row">
                <dt>状态</dt>
                <dd>
                  {{ reviewStatusLabel(item.status) }}
                  <template v-if="item.status !== 'open' && item.resolvedAt">
                    · 处理时间 {{ item.resolvedAt }}
                  </template>
                </dd>
              </div>
            </dl>

            <div v-if="item.status === 'open'" class="admin-review__actions">
              <p v-if="!canResolve" class="admin-review__readonly" role="note">
                只读角色：确认 / 驳回按钮已禁用。
              </p>

              <div class="admin-review__field">
                <label class="admin-review__label" :for="'review-note-' + item.id">备注（可选）</label>
                <textarea
                  :id="'review-note-' + item.id"
                  v-model="draftOf(item).note"
                  class="admin-review__textarea"
                  rows="2"
                  maxlength="512"
                  :disabled="!canResolve || resolvingId === item.id"
                  placeholder="记录确认或驳回的依据，最多 512 字"
                />
              </div>

              <template v-if="supportsApply(item)">
                <div class="admin-review__check">
                  <input
                    :id="'review-apply-' + item.id"
                    v-model="draftOf(item).applyChecked"
                    type="checkbox"
                    :disabled="!canResolve || resolvingId === item.id"
                  >
                  <label :for="'review-apply-' + item.id">
                    同时回填到案件（{{ applyFieldLabel(item) }}）
                  </label>
                </div>

                <div v-if="draftOf(item).applyChecked" class="admin-review__field">
                  <label class="admin-review__label" :for="'review-value-' + item.id">
                    回填值（{{ applyFieldLabel(item) }}）
                  </label>
                  <input
                    :id="'review-value-' + item.id"
                    v-model="draftOf(item).applyValue"
                    class="admin-review__input"
                    type="text"
                    :disabled="!canResolve || resolvingId === item.id"
                    :placeholder="item.fieldName === 'filedAt' ? 'YYYY-MM-DD' : '原告名称'"
                  >
                  <p class="admin-review__hint">
                    <template v-if="item.fieldName === 'filedAt'">
                      格式为 YYYY-MM-DD；留空表示清空该案件的立案日期。
                    </template>
                    <template v-else>
                      原告名称不能为空，最多 255 个字符。
                    </template>
                    回填只在核验项能唯一定位到 1 起案件时执行；对应 0 起或多起案件时服务端会拒绝回填并给出说明。
                  </p>
                </div>
              </template>

              <div class="admin-review__buttons">
                <BaseButton
                  size="sm"
                  :disabled="!canConfirm(item) || resolvingId === item.id"
                  @click="resolveItem(item, 'confirmed')"
                >
                  {{ resolvingId === item.id ? '提交中…' : '确认' }}
                </BaseButton>
                <BaseButton
                  size="sm"
                  variant="secondary"
                  :disabled="!canResolve || resolvingId === item.id"
                  @click="resolveItem(item, 'rejected')"
                >
                  驳回
                </BaseButton>
              </div>
            </div>

            <p v-else class="admin-review__resolved">
              处理时间：{{ item.resolvedAt || '未记录' }}；备注：{{ item.resolutionNote || '（无）' }}
            </p>
          </BaseCard>
        </li>
      </ul>

      <AdminPager
        :page="meta.page"
        :total-pages="meta.totalPages"
        :total="meta.total"
        :page-size="meta.pageSize"
        noun="条核验项"
        :page-sizes="[20, 48]"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
      />
    </template>
  </PageContainer>
</template>

<style scoped>
.admin-review {
  padding-block: var(--space-8) var(--space-16);
}

.admin-review__head {
  margin-bottom: var(--space-6);
}

.admin-review__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-review__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-review__notice {
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-review__form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: flex-end;
}

.admin-review__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 220px;
}

.admin-review__field--action {
  min-width: 0;
}

.admin-review__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-review__select,
.admin-review__input,
.admin-review__textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-sm);
}

.admin-review__textarea {
  min-height: 64px;
  resize: vertical;
}

.admin-review__select:disabled,
.admin-review__input:disabled,
.admin-review__textarea:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-review__success,
.admin-review__error,
.admin-review__conflict {
  margin-top: var(--space-5);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.admin-review__success {
  border: 1px solid var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
}

.admin-review__error {
  border: 1px solid var(--color-error);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
}

.admin-review__conflict {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 2px solid var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-text);
}

.admin-review__conflict-title {
  font-size: var(--text-lg);
  color: var(--color-warning);
}

.admin-review__conflict-message {
  color: var(--color-warning);
  font-weight: 600;
}

.admin-review__conflict-path {
  color: var(--color-text-muted);
}

.admin-review__summary {
  margin-top: var(--space-6);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-review__pending,
.admin-review__empty {
  margin-top: var(--space-4);
  padding: var(--space-6);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-page);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.admin-review__list {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-review__item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.admin-review__item-title {
  font-size: var(--text-base);
  color: var(--color-text);
}

.admin-review__status {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.admin-review__status--open {
  background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
  color: var(--color-warning);
}

.admin-review__status--confirmed {
  background-color: color-mix(in srgb, var(--color-success) 14%, transparent);
  color: var(--color-success);
}

.admin-review__status--rejected {
  background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}

.admin-review__meta {
  margin: var(--space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-review__meta-row {
  display: grid;
  grid-template-columns: 6.5em 1fr;
  gap: var(--space-3);
  align-items: baseline;
  font-size: var(--text-sm);
}

.admin-review__meta-row dt {
  color: var(--color-text-muted);
}

.admin-review__meta-row dd {
  margin: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.admin-review__value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.admin-review__context {
  max-height: 6em;
  overflow: auto;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  white-space: pre-wrap;
}

.admin-review__confidence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.admin-review__confidence-text {
  min-width: 3.5em;
  font-weight: 700;
  color: var(--color-text);
}

.admin-review__confidence-text--low {
  color: var(--color-warning);
}

.admin-review__confidence-bar {
  display: inline-block;
  width: 96px;
  height: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
}

.admin-review__confidence-fill {
  display: block;
  height: 100%;
  background-color: var(--color-success);
}

.admin-review__confidence-fill--low {
  background-color: var(--color-warning);
}

.admin-review__confidence-warn {
  color: var(--color-warning);
  font-size: var(--text-xs);
  font-weight: 600;
}

.admin-review__actions {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-review__readonly {
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-review__check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text);
}

.admin-review__check label {
  cursor: pointer;
}

.admin-review__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

.admin-review__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.admin-review__resolved {
  margin-top: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-review__item :deep(.base-card__body) {
  display: block;
}

@media (max-width: 639px) {
  .admin-review__meta-row {
    grid-template-columns: 1fr;
  }
}
</style>
