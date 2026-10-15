<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ADMIN_MAX_PAGE_SIZE,
  adminRequestErrorMessage,
  toAdminQuery,
  toNonNegativeInt,
  toPageMeta,
} from '~/utils/adminApi'

/**
 * 后台「远程可搜索下拉」：用于案件编辑里的品牌 / 律所关联选择。
 *
 * 为什么不做成一个把 228 个品牌 / 95 个律所一次性塞进去的 `<select>`：
 *   - 后端明确要求分页与关键词检索（`GET /api/admin/brands?keyword&page&pageSize`）；
 *   - 一次性拉全量既拖慢首屏，也让管理员在长列表里难以定位目标。
 * 因此本组件只在真正需要时才请求：
 *   - 输入框 → 输入关键词并回车，按关键词请求第 1 页；
 *   - 下拉框 → 展示当前已加载的候选（默认只加载 1 页，20 条）；
 *   - 「加载更多」→ 请求下一页并追加，只有用户主动点击时才会继续取数。
 *
 * 当前已选值始终以 `${value} / ${label}` 的形式展示在下方，即使它不在已加载的候选里也不会丢失。
 * 权限由父组件控制：`disabled` 为 true 时输入框、下拉与「加载更多」全部禁用。
 */
interface RemoteOption {
  id: number
  label: string
  /** 附加说明，例如英文名 */
  hint?: string
}

const props = withDefaults(defineProps<{
  /** 表单控件 id（label 的 for 指向它） */
  id: string
  /** 请求地址，例如 /api/admin/brands */
  endpoint: string
  /** 当前选中项 id；null 表示未选择 */
  modelValue: number | null
  /** 搜索框与下拉的可见标签 */
  label: string
  /** 空候选时的说明 */
  emptyHint?: string
  /** 是否禁用（只读角色 / 未登录） */
  disabled?: boolean
  /** 后端返回数组里的字段名 */
  labelKey: string
  hintKey?: string
  /** 每页条数，服务端上限 50 */
  pageSize?: number
  /**
   * 允许「搜不到就直接用输入的名字新建」。
   *
   * 需求：涉案品牌要能输入及搜索，搜不出来直接用输入的品牌，同时品牌表增加该品牌。
   * 开启后搜索无结果时会出现「用「xxx」新建」按钮。
   */
  allowCreate?: boolean
  /** 新建按钮文案模板，{name} 会被替换为输入的名称 */
  createLabel?: string
  /** 新建进行中（由父组件控制，避免重复提交） */
  creating?: boolean
}>(), {
  emptyHint: '没有匹配的候选项',
  disabled: false,
  hintKey: '',
  pageSize: 20,
  allowCreate: false,
  createLabel: '用「{name}」新建',
  creating: false
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  /** 请求失败时抛出中文消息，供父组件展示 */
  error: [message: string]
  /** 请求用输入的名称新建一项（父组件负责调接口并在成功后回填 id） */
  create: [name: string]
}>()

const options = ref<RemoteOption[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(false)
const loadError = ref('')
const keyword = ref('')

/** SSR 期间转发会话 Cookie，客户端等价于普通 $fetch。 */
const requestFetch = useRequestFetch()

const hasMore = computed(() => page.value < totalPages.value)
/** 已选中项：优先从候选里找，找不到时退回 id 展示，绝不静默显示成「未选择」 */
const selected = computed(() => options.value.find(item => item.id === props.modelValue) ?? null)

/** 后端返回的 item → 候选：只取 id 与文本字段，其余字段与只读统计一律忽略。 */
function toOption(item: Record<string, unknown>): RemoteOption | null {
  const id = Number(item.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const raw = item[props.labelKey]
  const label = typeof raw === 'string' && raw.trim() ? raw.trim() : `#${id}`
  const hintRaw = props.hintKey ? item[props.hintKey] : ''
  const hint = typeof hintRaw === 'string' ? hintRaw.trim() : ''
  return { id, label, ...(hint ? { hint } : {}) }
}

/**
 * 拉取候选。
 * @param targetPage 目标页
 * @param replace    为 true 时替换当前候选（新搜索 / 重试），否则追加（加载更多）
 */
async function load(targetPage: number, replace: boolean) {
  if (props.disabled || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const payload = await requestFetch<{ data?: Record<string, unknown>[], meta?: Record<string, unknown> }>(props.endpoint, {
      query: toAdminQuery({
        keyword: keyword.value.trim(),
        page: targetPage,
        // 服务端上限 50；这里显式夹取，避免把非法 pageSize 发出去
        pageSize: Math.min(props.pageSize, ADMIN_MAX_PAGE_SIZE),
      }),
    })
    const rows = Array.isArray(payload?.data) ? payload.data : []
    const next = rows.map(toOption).filter((item): item is RemoteOption => item !== null)
    options.value = replace ? next : [...options.value, ...next.filter(item => !options.value.some(existing => existing.id === item.id))]
    const meta = toPageMeta(payload?.meta, { page: targetPage, pageSize: props.pageSize })
    page.value = meta.page
    totalPages.value = Math.max(1, meta.totalPages)
    total.value = Math.max(toNonNegativeInt(meta.total, options.value.length), options.value.length)
  } catch (error) {
    loadError.value = adminRequestErrorMessage(error, '候选项加载失败，请稍后重试')
    emit('error', loadError.value)
  } finally {
    loading.value = false
  }
}

/** 关键词变化后回到第 1 页重新搜索。 */
function onSearch() {
  options.value = []
  void load(1, true)
}

/** 加载下一页并追加。 */
function onLoadMore() {
  if (!hasMore.value) return
  void load(page.value + 1, false)
}

/** 下拉选择：空值表示清空关联（父组件据此发送 null）。 */
function onSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value === '' ? null : Number(value))
}

/**
 * 用当前输入框里的名称新建一项。
 *
 * 只在 allowCreate 且关键词非空时可用——空名称建出来的是无意义记录。
 * 命名交给父组件：它才知道该调哪个接口、成功后如何回填 id。
 */
function onCreateFromKeyword() {
  if (!props.allowCreate || props.disabled || props.creating) return
  const name = keyword.value.trim()
  if (!name) return
  emit('create', name)
}

/** 搜索无结果且允许新建时，提示可以直接新建。 */
const canCreateFromKeyword = computed(() => (
  props.allowCreate
  && !props.disabled
  && !loading.value
  && !props.creating
  && keyword.value.trim().length > 0
))

/** 新建按钮文案（把 {name} 换成实际名称）。 */
const createButtonLabel = computed(() => (
  props.createLabel.replace('{name}', keyword.value.trim())
))

/** 首次挂载时只拉一页候选，不预取全量。 */
void load(1, true)

// 清空关键词时刷新回第一页，避免旧关键词的结果留在候选里。
watch(keyword, (next, previous) => {
  if (!next.trim() && previous.trim()) onSearch()
})
</script>

<template>
  <div class="admin-remote-select">
    <label class="admin-remote-select__label" :for="`${id}-keyword`">{{ label }}：按关键词搜索</label>
    <div class="admin-remote-select__search">
      <input
        :id="`${id}-keyword`"
        v-model="keyword"
        class="admin-remote-select__input"
        type="search"
        :disabled="disabled || loading"
        :placeholder="`输入${label}名称后回车搜索`"
        @keydown.enter.prevent="onSearch"
      >
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="disabled || loading"
        @click="onSearch"
      >
        {{ loading ? '搜索中…' : '搜索' }}
      </BaseButton>
    </div>

    <label class="admin-remote-select__label" :for="id">{{ label }}</label>
    <select
      :id="id"
      class="admin-remote-select__select"
      :value="modelValue === null ? '' : String(modelValue)"
      :disabled="disabled || loading"
      @change="onSelect"
    >
      <option value="">未选择</option>
      <option v-for="item in options" :key="item.id" :value="String(item.id)">
        {{ item.label }}<template v-if="item.hint">（{{ item.hint }}）</template>
      </option>
      <option v-if="selected === null && modelValue !== null" :value="String(modelValue)">
        #{{ modelValue }}（不在当前候选中）
      </option>
    </select>

    <p class="admin-remote-select__status" role="status">
      已加载 {{ options.length }} / {{ total }} 项
      <template v-if="selected">，当前选中：{{ selected.label }}</template>
      <template v-else-if="modelValue !== null">，当前选中 ID：{{ modelValue }}</template>
      <template v-else>，当前未选择</template>
    </p>

    <div class="admin-remote-select__actions">
      <BaseButton
        v-if="hasMore"
        variant="ghost"
        size="sm"
        :disabled="disabled || loading"
        @click="onLoadMore"
      >
        {{ loading ? '加载中…' : `加载更多（还有第 ${page + 1} / ${totalPages} 页）` }}
      </BaseButton>
      <p v-if="!options.length && !loading" class="admin-remote-select__empty">{{ emptyHint }}</p>
    </div>

    <!-- 搜索无结果且允许新建：直接用输入的名称建一条，避免先去别的页面建好再回来选 -->
    <div v-if="allowCreate && canCreateFromKeyword" class="admin-remote-select__create">
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="disabled || creating"
        @click="onCreateFromKeyword"
      >
        {{ creating ? '新建中…' : createButtonLabel }}
      </BaseButton>
      <span class="admin-remote-select__create-hint">搜不到就新建，并把当前记录关联到它</span>
    </div>

    <div v-if="$slots.default" class="admin-remote-select__extra">
      <slot />
    </div>

    <p v-if="loadError" class="admin-remote-select__error" role="alert">{{ loadError }}</p>
  </div>
</template>

<style scoped>
.admin-remote-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-remote-select__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-remote-select__create {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.admin-remote-select__create-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-remote-select__search {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.admin-remote-select__input,
.admin-remote-select__select {
  width: 100%;
  max-width: 420px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-remote-select__input:disabled,
.admin-remote-select__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-remote-select__status {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-remote-select__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.admin-remote-select__empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-remote-select__extra {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.admin-remote-select__error {
  font-size: var(--text-sm);
  color: var(--color-error);
}
</style>
