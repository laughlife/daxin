<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { ServiceChildItem, ServiceSection } from '~/types/adminSettings'
import { apiErrorMessage, httpStatusOf } from '~/utils/publicApi'
import { SETTINGS_READ_ONLY_NOTICE, canWriteSettings, nextUniqueSlug } from '~/utils/adminPermissions'

/**
 * 核心业务板块（首页「核心业务」四块）。
 *
 * 数据来源：GET /api/admin/settings?kind=services
 * 保存：PUT /api/admin/settings（body { kind: 'services', items }）
 *
 * 契约要点：
 * - 板块按 `id` 或 `slug` upsert；子项同理，新增子项还没有 id，因此必须带 slug，
 *   否则服务端会用数组下标兜底（`item-N`），一次提交多个新子项会互相覆盖。
 *   本页为新增子项生成 `new-child-N` 形式的唯一 slug。
 * - 服务端**不删除**未提交的子项：这里也不做删除，只做编辑与排序。
 * - `showDetailLink` 的需求是：只有第一块「TRO 全流程处理」展示「了解详情」，
 *   且链接到 /tro/success-cases。启用多项时给出非阻断的提醒。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '核心业务配置',
  description: '维护首页核心业务板块与子项。',
  robots: 'noindex, nofollow'
})

interface ServicesPayload {
  items: ServiceSection[]
}

const requestFetch = useRequestFetch()
const { user } = useAdminSession()

const writable = computed(() => canWriteSettings(user.value?.roles))
const readOnlyNotice = SETTINGS_READ_ONLY_NOTICE
const controlsDisabled = computed(() => !writable.value)

const sections = ref<ServiceSection[]>([])
const baseline = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toFlag(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value ? 1 : 0
  return value ? 1 : 0
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** 快照：与 baseline 比较，判断是否有未保存的修改 */
function snapshot(): string {
  return JSON.stringify(sections.value)
}

function applyPayload(payload: { data: ServicesPayload }) {
  const items = payload?.data?.items ?? []
  sections.value = items.map(section => ({
    id: toNumber(section.id),
    slug: toText(section.slug),
    title: toText(section.title),
    subtitle: toText(section.subtitle),
    summary: toText(section.summary),
    iconKey: toText(section.iconKey),
    linkPath: toText(section.linkPath),
    showDetailLink: toFlag(section.showDetailLink),
    sortOrder: toNumber(section.sortOrder),
    status: toFlag(section.status),
    items: (Array.isArray(section.items) ? section.items : []).map(child => ({
      id: toNumber(child.id),
      slug: toText(child.slug),
      title: toText(child.title),
      summary: toText(child.summary),
      sortOrder: toNumber(child.sortOrder),
      status: toFlag(child.status)
    }))
  }))
  baseline.value = snapshot()
  return sections.value
}

const { error: loadError, refresh } = await useAsyncData(
  'admin-settings-services',
  () => requestFetch<{ data: ServicesPayload }>('/api/admin/settings', { query: { kind: 'services' } }),
  { transform: payload => applyPayload(payload) }
)

const dirty = computed(() => snapshot() !== baseline.value)

/** showDetailLink 被多个板块启用时的非阻断提醒（需求：只有第一块显示「了解详情」） */
const detailLinkWarnings = computed(() =>
  sections.value
    .map((section, index) => ({ section, index }))
    .filter(entry => entry.section.showDetailLink === 1)
)

function canSave(): boolean {
  return writable.value && !saving.value && dirty.value && sections.value.length > 0
}

function saveLabel(): string {
  if (saving.value) return '保存中…'
  if (!writable.value) return '保存（只读角色不可用）'
  if (!sections.value.length) return '暂无可保存的板块'
  if (!dirty.value) return '保存（暂无修改）'
  return '保存'
}

function loadErrorMessage(): string {
  const message = apiErrorMessage(loadError.value)
  if (message) return message
  const status = httpStatusOf(loadError.value)
  if (status === 401) return '登录状态已失效，请重新登录后再试'
  if (status === 403) return '当前账号没有站点配置读取权限'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  return '核心业务配置加载失败，请稍后重试'
}

/** 提交体：只带上服务端认识的字段 */
function buildPayload() {
  return sections.value.map(section => ({
    id: section.id,
    slug: section.slug,
    title: section.title,
    subtitle: section.subtitle,
    summary: section.summary,
    iconKey: section.iconKey,
    linkPath: section.linkPath,
    showDetailLink: section.showDetailLink,
    sortOrder: section.sortOrder,
    status: section.status,
    items: section.items.map(child => ({
      id: child.id,
      slug: child.slug,
      title: child.title,
      summary: child.summary,
      sortOrder: child.sortOrder,
      status: child.status
    }))
  }))
}

async function save() {
  if (!canSave()) return
  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''
  try {
    await requestFetch('/api/admin/settings', {
      method: 'PUT',
      body: { kind: 'services', items: buildPayload() }
    })
    saveSuccess.value = '核心业务配置已保存'
    await refresh()
  } catch (cause) {
    saveError.value = apiErrorMessage(cause) || '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------------------
// 排序：交换相邻项的 sortOrder（不使用拖拽库）
// ---------------------------------------------------------------------------

/** 交换相邻两项并保证 sortOrder 严格递增，便于再次上下移动 */
function swapOrder(list: { sortOrder: number }[], index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const current = list[index]
  const other = list[target]
  if (!current || !other) return
  const order = current.sortOrder
  current.sortOrder = other.sortOrder
  other.sortOrder = order
  list.sort((a, b) => a.sortOrder - b.sortOrder)
}

function moveSection(index: number, delta: number) {
  swapOrder(sections.value, index, delta)
  saveSuccess.value = ''
}

function moveChild(section: ServiceSection, index: number, delta: number) {
  swapOrder(section.items, index, delta)
  saveSuccess.value = ''
}

// ---------------------------------------------------------------------------
// 子项增删
// ---------------------------------------------------------------------------

/** 收集全部已用 slug（板块 + 子项），避免新增子项撞唯一键 */
function usedSlugs(): string[] {
  const used: string[] = []
  for (const section of sections.value) {
    used.push(section.slug)
    for (const child of section.items) used.push(child.slug)
  }
  return used
}

function addChild(section: ServiceSection) {
  const sortOrder = section.items.reduce((max, child) => Math.max(max, child.sortOrder), 0) + 10
  const child: ServiceChildItem = {
    id: 0,
    slug: nextUniqueSlug('new-child', usedSlugs()),
    title: '',
    summary: '',
    sortOrder,
    status: 1
  }
  section.items.push(child)
  saveSuccess.value = ''
}

/**
 * 从列表移除一项。
 * 服务端不删除未提交的子项，因此这里只从本次提交里摘除；
 * 说明文案会明确告知「已保存过的子项不会因此从数据库删除」。
 * 未保存的新增项（id = 0）可以直接移除。
 */
function removeChild(section: ServiceSection, index: number) {
  section.items.splice(index, 1)
  saveSuccess.value = ''
}

/** 子项是否可安全移除（未保存的新增项） */
function isNewChild(child: ServiceChildItem): boolean {
  return child.id === 0
}

const STATUS_OPTIONS = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]
</script>

<template>
  <PageContainer class="admin-services" size="wide">
    <header class="admin-services__head">
      <h1 class="admin-services__title">核心业务配置</h1>
      <p class="admin-services__desc">
        维护首页「核心业务」四个板块及其子项。保存后首页立即按此配置渲染。
      </p>
    </header>

    <p v-if="!writable" class="admin-services__readonly" role="note">
      {{ readOnlyNotice }}（当前角色对站点配置只有读取权限，所有输入框与保存按钮均已禁用）。
    </p>

    <ErrorState
      v-if="loadError"
      title="核心业务配置加载失败"
      :message="loadErrorMessage()"
      @retry="refresh()"
    />

    <template v-else>
      <p v-if="detailLinkWarnings.length > 1" class="admin-services__warning" role="alert">
        需求约定只有第一个板块「TRO 全流程处理」展示「了解详情」并跳转 /tro/success-cases，
        当前有 {{ detailLinkWarnings.length }} 个板块启用了「显示了解详情」：
        {{ detailLinkWarnings.map(entry => entry.section.title || entry.section.slug).join('、') }}。
        此提示不阻止保存，请确认是否符合预期。
      </p>

      <BaseCard
        v-for="(section, sectionIndex) in sections"
        :key="section.id || section.slug || sectionIndex"
        class="admin-services__section"
        :title="section.title || `未命名板块（${section.slug}）`"
        :title-level="2"
      >
        <template #default>
          <p class="admin-services__hint">
            标识 slug：<code>{{ section.slug }}</code>
            <span v-if="section.id">（ID {{ section.id }}）</span>
            <span v-else>（新增板块将按 slug 写入）</span>
          </p>

          <div class="admin-services__grid">
            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-title`">板块标题</label>
              <input
                :id="`section-${sectionIndex}-title`"
                v-model="section.title"
                class="admin-services__input"
                type="text"
                maxlength="128"
                :disabled="controlsDisabled || saving"
              >
            </div>

            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-subtitle`">副标题</label>
              <input
                :id="`section-${sectionIndex}-subtitle`"
                v-model="section.subtitle"
                class="admin-services__input"
                type="text"
                maxlength="255"
                :disabled="controlsDisabled || saving"
              >
            </div>

            <div class="admin-services__cell admin-services__cell--wide">
              <label class="admin-services__label" :for="`section-${sectionIndex}-summary`">板块说明</label>
              <textarea
                :id="`section-${sectionIndex}-summary`"
                v-model="section.summary"
                class="admin-services__textarea"
                rows="3"
                :disabled="controlsDisabled || saving"
              />
            </div>

            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-icon`">图标标识 iconKey</label>
              <input
                :id="`section-${sectionIndex}-icon`"
                v-model="section.iconKey"
                class="admin-services__input"
                type="text"
                maxlength="64"
                :disabled="controlsDisabled || saving"
              >
            </div>

            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-link`">详情链接</label>
              <input
                :id="`section-${sectionIndex}-link`"
                v-model="section.linkPath"
                class="admin-services__input"
                type="text"
                maxlength="255"
                placeholder="例如：/tro/success-cases"
                :disabled="controlsDisabled || saving"
              >
            </div>

            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-order`">排序值</label>
              <input
                :id="`section-${sectionIndex}-order`"
                v-model.number="section.sortOrder"
                class="admin-services__input"
                type="number"
                min="0"
                max="65535"
                :disabled="controlsDisabled || saving"
              >
            </div>

            <div class="admin-services__cell">
              <label class="admin-services__label" :for="`section-${sectionIndex}-status`">状态</label>
              <select
                :id="`section-${sectionIndex}-status`"
                v-model.number="section.status"
                class="admin-services__select"
                :disabled="controlsDisabled || saving"
              >
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="admin-services__cell admin-services__cell--inline">
              <input
                :id="`section-${sectionIndex}-detail`"
                v-model.number="section.showDetailLink"
                type="checkbox"
                :true-value="1"
                :false-value="0"
                :disabled="controlsDisabled || saving"
              >
              <label class="admin-services__label" :for="`section-${sectionIndex}-detail`">
                显示「了解详情」链接
              </label>
            </div>
          </div>

          <p class="admin-services__hint">
            「了解详情」按需求只应出现在第一块「TRO 全流程处理」，并跳转 /tro/success-cases；
            其余板块请勿启用。
          </p>

          <div class="admin-services__actions">
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || saving || sectionIndex === 0"
              @click="moveSection(sectionIndex, -1)"
            >
              板块上移
            </BaseButton>
            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="controlsDisabled || saving || sectionIndex === sections.length - 1"
              @click="moveSection(sectionIndex, 1)"
            >
              板块下移
            </BaseButton>
          </div>

          <section class="admin-services__children" :aria-labelledby="`section-${sectionIndex}-children-title`">
            <h3 :id="`section-${sectionIndex}-children-title`" class="admin-services__children-title">
              子项（{{ section.items.length }}）
            </h3>

            <div
              v-for="(child, childIndex) in section.items"
              :key="child.id || child.slug || childIndex"
              class="admin-services__child"
            >
              <p class="admin-services__hint">
                标识 slug：<code>{{ child.slug }}</code>
                <span v-if="child.id">（ID {{ child.id }}）</span>
                <span v-else>（新增子项，保存后生成记录）</span>
              </p>

              <div class="admin-services__grid">
                <div class="admin-services__cell">
                  <label class="admin-services__label" :for="`child-${sectionIndex}-${childIndex}-title`">
                    子项标题
                  </label>
                  <input
                    :id="`child-${sectionIndex}-${childIndex}-title`"
                    v-model="child.title"
                    class="admin-services__input"
                    type="text"
                    maxlength="128"
                    :disabled="controlsDisabled || saving"
                  >
                </div>

                <div class="admin-services__cell">
                  <label class="admin-services__label" :for="`child-${sectionIndex}-${childIndex}-summary`">
                    子项说明
                  </label>
                  <input
                    :id="`child-${sectionIndex}-${childIndex}-summary`"
                    v-model="child.summary"
                    class="admin-services__input"
                    type="text"
                    maxlength="2000"
                    :disabled="controlsDisabled || saving"
                  >
                </div>

                <div class="admin-services__cell">
                  <label class="admin-services__label" :for="`child-${sectionIndex}-${childIndex}-order`">
                    排序值
                  </label>
                  <input
                    :id="`child-${sectionIndex}-${childIndex}-order`"
                    v-model.number="child.sortOrder"
                    class="admin-services__input"
                    type="number"
                    min="0"
                    max="65535"
                    :disabled="controlsDisabled || saving"
                  >
                </div>

                <div class="admin-services__cell">
                  <label class="admin-services__label" :for="`child-${sectionIndex}-${childIndex}-status`">
                    状态
                  </label>
                  <select
                    :id="`child-${sectionIndex}-${childIndex}-status`"
                    v-model.number="child.status"
                    class="admin-services__select"
                    :disabled="controlsDisabled || saving"
                  >
                    <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="admin-services__actions">
                <BaseButton
                  variant="ghost"
                  size="sm"
                  :disabled="controlsDisabled || saving || childIndex === 0"
                  @click="moveChild(section, childIndex, -1)"
                >
                  上移
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  :disabled="controlsDisabled || saving || childIndex === section.items.length - 1"
                  @click="moveChild(section, childIndex, 1)"
                >
                  下移
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  :disabled="controlsDisabled || saving"
                  @click="removeChild(section, childIndex)"
                >
                  {{ isNewChild(child) ? '移除' : '移出本次提交' }}
                </BaseButton>
              </div>
            </div>

            <p v-if="section.items.length === 0" class="admin-services__hint">该板块暂无子项。</p>

            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="controlsDisabled || saving"
              @click="addChild(section)"
            >
              新增子项
            </BaseButton>
          </section>
        </template>
      </BaseCard>

      <p class="admin-services__hint">
        说明：接口按 id / slug 更新已提交的项，不会删除未提交的子项；上面对已保存子项的「移除」
        仅表示本次不提交该项，数据库记录仍然保留。
      </p>

      <p v-if="saveSuccess" class="admin-services__success" role="status">{{ saveSuccess }}</p>
      <p v-if="saveError" class="admin-services__error" role="alert">{{ saveError }}</p>

      <div class="admin-services__actions admin-services__actions--footer">
        <BaseButton :disabled="!canSave()" @click="save">{{ saveLabel() }}</BaseButton>
        <span v-if="saving" class="admin-services__hint" role="status">保存中，请勿关闭页面…</span>
        <span v-else-if="dirty && writable" class="admin-services__hint">有未保存的修改</span>
      </div>
    </template>

    <p class="admin-services__back">
      <NuxtLink to="/admin">返回后台首页</NuxtLink>
    </p>
  </PageContainer>
</template>

<style scoped>
.admin-services {
  padding-block: var(--space-8) var(--space-16);
}

.admin-services__head {
  margin-bottom: var(--space-6);
}

.admin-services__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-services__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-services__readonly,
.admin-services__warning {
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.admin-services__readonly {
  border: 1px solid var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
}

.admin-services__warning {
  border: 1px solid var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
}

.admin-services__section {
  margin-top: var(--space-6);
}

.admin-services__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.admin-services__cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.admin-services__cell--wide {
  grid-column: span 2;
}

.admin-services__cell--inline {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
}

.admin-services__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-services__input,
.admin-services__textarea,
.admin-services__select {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-services__textarea {
  line-height: var(--leading-normal);
  resize: vertical;
}

.admin-services__select {
  max-width: 200px;
}

.admin-services__input:disabled,
.admin-services__textarea:disabled,
.admin-services__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-services__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-services__children {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--color-border-strong);
}

.admin-services__children-title {
  margin-bottom: var(--space-3);
  font-size: var(--text-base);
  color: var(--color-text);
}

.admin-services__child {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
}

.admin-services__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-services__actions--footer {
  align-items: center;
  margin-top: var(--space-6);
}

.admin-services__success {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-services__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-services__back {
  margin-top: var(--space-8);
  font-size: var(--text-sm);
}
</style>
