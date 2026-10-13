<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { HomeStatEntry, SettingItem } from '~/types/adminSettings'
import { apiErrorMessage, httpStatusOf } from '~/utils/publicApi'
import { SETTINGS_READ_ONLY_NOTICE, canWriteSettings } from '~/utils/adminPermission'

/**
 * 站点设置：站点 / 首页 / 关于三类 key-value 文案配置。
 *
 * 数据来源：GET /api/admin/settings?kind=<site|home|about>
 * 保存：PUT /api/admin/settings（body { kind, items }，每个 kind 一个保存按钮）
 *
 * 关键约定（见 docs/superpowers/task7-admin-contract.md 第一节）：
 * - `value` 是**库中原始字符串**，接口不做 JSON 解析；`valueType: 'json'` 的项
 *   由本页 JSON.parse 成结构化编辑器、保存时再 JSON.stringify 回去。
 * - `valueType: 'image'` 的项：正文留空，展示地址取联表返回的 `mediaUrl`，
 *   上传成功后把 `mediaId` 一并提交（服务端 normalizeSettingItems 接受 mediaId，
 *   并写入 site_settings.media_id）。
 * - 解析失败的 JSON **拒绝覆盖**：整类数据判定为「不可保存」，先提示用户修复。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '站点设置',
  description: '维护站点基础信息、首页文案与关于我们配置。',
  robots: 'noindex, nofollow'
})

/** 三类文案配置 */
type GroupKind = 'site' | 'home' | 'about'

interface GroupPayload {
  items: SettingItem[]
}

interface CoreAdvantageHighlightOption {
  text: string
  enabled: boolean
}

interface CoreAdvantageEditorEntry {
  title: string
  description: string
  highlights: CoreAdvantageHighlightOption[]
}

const requestFetch = useRequestFetch()
const { user } = useAdminSession()

const TABS: { kind: GroupKind, label: string, description: string }[] = [
  { kind: 'site', label: '站点信息', description: '站点名称、描述、联系方式与站点 Logo。' },
  { kind: 'home', label: '首页文案', description: '首页首屏、数据概览、咨询区的文案与配图。' },
  { kind: 'about', label: '关于我们', description: '团队介绍标题、段落与配图。' }
]

/** 默认展开第一个 tab */
const activeKind = ref<GroupKind>('site')

const writable = computed(() => canWriteSettings(user.value?.roles))
const readOnlyNotice = SETTINGS_READ_ONLY_NOTICE
const controlsDisabled = computed(() => !writable.value)

/** 三类配置的本地编辑态 */
const editItems = {
  site: ref<SettingItem[]>([]),
  home: ref<SettingItem[]>([]),
  about: ref<SettingItem[]>([]),
}

/** 已下线的历史配置不进入后台编辑态，避免继续暴露给管理员。 */
const HIDDEN_SETTING_KEYS = new Set([
  'home_banner_image',
  'home_right_image',
  'about_hero_paragraph',
  'about_business_images',
])

/** baseline 快照（JSON 字符串）：用于判断是否有未保存的修改 */
const baseline = reactive<Record<GroupKind, string>>({
  site: '',
  home: '',
  about: ''
})

/** 结构化编辑器状态 */
const homeStats = ref<HomeStatEntry[]>([])
const aboutParagraphs = ref<string[]>([])
const coreAdvantages = ref<CoreAdvantageEditorEntry[]>([])
/** 解析失败等阻断保存的原因：`kind:key` → 中文说明 */
const blockingErrors = reactive<Record<string, string>>({})

/** 本地上传得到的展示地址：`kind:key` → URL（优先于接口返回的 mediaUrl） */
const uploadedUrls = reactive<Record<string, string>>({})
/** 正在上传的配置项（上传期间禁止保存，避免提交旧的 mediaId） */
const uploadingKeys = ref<string[]>([])

const savingKind = ref<GroupKind | ''>('')
const saveError = reactive<Record<GroupKind, string>>({ site: '', home: '', about: '' })
const saveSuccess = reactive<Record<GroupKind, string>>({ site: '', home: '', about: '' })

// ---------------------------------------------------------------------------
// 取数与本地态
// ---------------------------------------------------------------------------

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 解析 home_stats（数组，元素为 { value, label, description, emphasis }） */
function parseHomeStats(items: SettingItem[]): HomeStatEntry[] {
  const item = items.find(entry => entry.key === 'home_stats')
  if (!item) return []
  let parsed: unknown
  try {
    parsed = item.value ? JSON.parse(item.value) : []
  } catch {
    blockingErrors['home:home_stats'] = '库中已有的 home_stats 不是合法 JSON，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors['home:home_stats'] = '库中已有的 home_stats 不是数组，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  return parsed.map((entry) => {
    const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    return {
      value: toText(record.value),
      label: toText(record.label),
      description: toText(record.description),
      emphasis: record.emphasis === true || record.emphasis === 1 || record.emphasis === '1'
    }
  })
}

/** 解析 about_team_paragraphs（字符串数组） */
function parseParagraphs(items: SettingItem[]): string[] {
  const item = items.find(entry => entry.key === 'about_team_paragraphs')
  if (!item) return []
  let parsed: unknown
  try {
    parsed = item.value ? JSON.parse(item.value) : []
  } catch {
    blockingErrors['about:about_team_paragraphs'] = '库中已有的 about_team_paragraphs 不是合法 JSON，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'string')) {
    blockingErrors['about:about_team_paragraphs'] = '库中已有的 about_team_paragraphs 不是字符串数组，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  return parsed as string[]
}

/** 解析 home_core_advantages，重点片段通过勾选控制是否写入 highlights。 */
function parseCoreAdvantages(items: SettingItem[]): CoreAdvantageEditorEntry[] {
  const item = items.find(entry => entry.key === 'home_core_advantages')
  if (!item) return []
  let parsed: unknown
  try {
    parsed = item.value ? JSON.parse(item.value) : []
  } catch {
    blockingErrors['home:home_core_advantages'] = '库中已有的 home_core_advantages 不是合法 JSON，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors['home:home_core_advantages'] = '库中已有的 home_core_advantages 不是数组，无法结构化编辑。为避免覆盖原始数据，已停用该编辑区并禁止保存，请先在数据库中修复该配置。'
    return []
  }
  return parsed.map((entry) => {
    const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const highlights = Array.isArray(record.highlights) ? record.highlights.filter(value => typeof value === 'string' && value.trim()) as string[] : []
    return {
      title: toText(record.title),
      description: toText(record.description),
      highlights: highlights.map(text => ({ text, enabled: true }))
    }
  }).filter(entry => entry.title || entry.description)
}

function serializeCoreAdvantages() {
  return coreAdvantages.value.map(entry => ({
    title: entry.title,
    description: entry.description,
    highlights: entry.highlights.filter(option => option.enabled && option.text.trim()).map(option => option.text.trim())
  }))
}

/** 当前编辑态的标准化快照：与 baseline 比较，同时固定提交时的 JSON 序列化形式 */
function snapshot(kind: GroupKind): string {
  const items = editItems[kind].value.map((item) => {
    if (kind === 'home' && item.key === 'home_stats') {
      return { ...item, value: JSON.stringify(homeStats.value) }
    }
    if (kind === 'home' && item.key === 'home_core_advantages') {
      return { ...item, value: JSON.stringify(serializeCoreAdvantages()) }
    }
    if (kind === 'about' && item.key === 'about_team_paragraphs') {
      return { ...item, value: JSON.stringify(aboutParagraphs.value) }
    }
    return { ...item }
  })
  return JSON.stringify(items)
}

const IMAGE_LIST_KEYS = [
  'about_hero_image',
  'about_success_images',
  'about_lecture_images',
  'about_partner_images',
  'about_honors_images',
] as const

function isImageListKey(key: string): boolean {
  return (IMAGE_LIST_KEYS as readonly string[]).includes(key)
}

/** key → 当前图片 URL 数组（多图字段的编辑态） */
const imageLists = reactive<Record<string, string[]>>({})

/**
 * 解析多图字段。
 * 兼容两种历史写法：纯 URL 字符串数组，或 { url } / { mediaUrl } 对象数组。
 * 解析失败时登记阻断错误，禁止保存以免覆盖原始数据（与其它 JSON 字段同一策略）。
 */
function parseImageList(items: SettingItem[], key: string): string[] {
  const item = items.find(entry => entry.key === key)
  if (!item) return []
  let parsed: unknown
  try {
    parsed = item.value ? JSON.parse(item.value) : []
  } catch {
    blockingErrors[`about:${key}`] = `库中已有的 ${key} 不是合法 JSON，无法用图片控件编辑。为避免覆盖原始数据，已禁止保存，请先在数据库中修复该配置。`
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors[`about:${key}`] = `库中已有的 ${key} 不是数组，无法用图片控件编辑。为避免覆盖原始数据，已禁止保存，请先在数据库中修复该配置。`
    return []
  }
  const urls: string[] = []
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      if (entry.trim()) urls.push(entry.trim())
      continue
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      const url = record.url ?? record.mediaUrl ?? record.imageUrl
      if (typeof url === 'string' && url.trim()) urls.push(url.trim())
    }
  }
  return urls
}

/** 多图字段变化：写回编辑态，由保存按钮统一提交。 */
function onImagesChanged(key: string, value: string[]) {
  imageLists[key] = value
}

/** 多图上传中同样禁止保存，避免提交半截数据。 */
function onImagesUploading(key: string, value: boolean) {
  const token = `about:${key}`
  if (value) {
    if (!uploadingKeys.value.includes(token)) uploadingKeys.value.push(token)
  } else {
    uploadingKeys.value = uploadingKeys.value.filter(entry => entry !== token)
  }
}

/**
 * 把接口返回的 items 落到本地编辑态并重建 baseline。
 * 只由 useAsyncData 的 transform 调用，因此必须与 DOM 无关。
 */
function applyGroup(kind: GroupKind, payload: { data: GroupPayload }) {
  const sourceItems = payload?.data?.items ?? []
  const items = sourceItems.filter(item => !HIDDEN_SETTING_KEYS.has(item.key))
  const prefix = `${kind}:`
  for (const key of Object.keys(blockingErrors)) {
    if (key.startsWith(prefix)) delete blockingErrors[key]
  }
  for (const key of Object.keys(uploadedUrls)) {
    if (key.startsWith(prefix)) delete uploadedUrls[key]
  }
  if (kind === 'home') homeStats.value = parseHomeStats(items)
  if (kind === 'home') coreAdvantages.value = parseCoreAdvantages(items)
  if (kind === 'about') {
    aboutParagraphs.value = parseParagraphs(items)
    for (const key of IMAGE_LIST_KEYS) {
      imageLists[key] = parseImageList(items, key)
    }
  }
  editItems[kind].value = items
  baseline[kind] = snapshot(kind)
  return items
}

/** 三类数据分别用稳定的 key 取数；三个面板都渲染，切换不会丢失未保存的编辑。 */
const { error: siteError, refresh: refreshSite } = await useAsyncData(
  'admin-settings-site',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'site' } }),
  { transform: payload => applyGroup('site', payload) }
)
const { error: homeError, refresh: refreshHome } = await useAsyncData(
  'admin-settings-home',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'home' } }),
  { transform: payload => applyGroup('home', payload) }
)
const { error: aboutError, refresh: refreshAbout } = await useAsyncData(
  'admin-settings-about',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'about' } }),
  { transform: payload => applyGroup('about', payload) }
)
const groupErrors = computed<Record<GroupKind, unknown>>(() => ({
  site: siteError.value,
  home: homeError.value,
  about: aboutError.value
}))

// ---------------------------------------------------------------------------
// 状态判定
// ---------------------------------------------------------------------------

const dirty = computed<Record<GroupKind, boolean>>(() => ({
  site: snapshot('site') !== baseline.site,
  home: snapshot('home') !== baseline.home,
  about: snapshot('about') !== baseline.about
}))

/** 该 kind 是否存在阻断保存的问题（JSON 解析失败等） */
function blockReason(kind: GroupKind): string {
  const prefix = `${kind}:`
  const hit = Object.keys(blockingErrors).find(key => key.startsWith(prefix))
  return hit ? blockingErrors[hit] ?? '' : ''
}

/** 保存按钮是否可用：只读角色、保存中、上传中、无改动、解析失败时一律禁用 */
function canSave(kind: GroupKind): boolean {
  return writable.value
    && !savingKind.value
    && uploadingKeys.value.length === 0
    && dirty.value[kind]
    && !blockReason(kind)
}

/** 保存按钮文案（禁用原因直接写在按钮上，避免用户误以为按钮失灵） */
function saveLabel(kind: GroupKind): string {
  if (savingKind.value === kind) return '保存中…'
  if (!writable.value) return '保存（只读角色不可用）'
  if (blockReason(kind)) return '保存（请先修复解析错误）'
  if (!dirty.value[kind]) return '保存（暂无修改）'
  return '保存'
}

/** 加载失败的中文提示 */
function loadErrorMessage(error: unknown, label: string): string {
  const message = apiErrorMessage(error)
  if (message) return message
  const status = httpStatusOf(error)
  if (status === 401) return '登录状态已失效，请重新登录后再试'
  if (status === 403) return '当前账号没有站点配置读取权限'
  if (status >= 500) return '服务器暂时不可用，请稍后重试'
  return `${label}加载失败，请稍后重试`
}

async function retry(kind: GroupKind) {
  if (kind === 'site') await refreshSite()
  else if (kind === 'home') await refreshHome()
  else await refreshAbout()
}

/** 组装提交给接口的 items：JSON 项序列化、图片项带上 mediaId */
function buildPayload(kind: GroupKind) {
  return editItems[kind].value.map((item) => {
    let value = item.value
    if (kind === 'home' && item.key === 'home_stats') {
      value = JSON.stringify(homeStats.value)
    }
    if (kind === 'home' && item.key === 'home_core_advantages') {
      value = JSON.stringify(serializeCoreAdvantages())
    }
    if (kind === 'about' && item.key === 'about_team_paragraphs') {
      value = JSON.stringify(aboutParagraphs.value)
    }
    // 多图字段：把图片控件里的 URL 数组序列化回 json 字符串
    if (kind === 'about' && isImageListKey(item.key)) {
      value = JSON.stringify(imageLists[item.key] ?? [])
    }
    return {
      key: item.key,
      value,
      valueType: item.valueType,
      // 图片类配置：value 保持原样，真实资源由 mediaId 关联
      mediaId: item.mediaId,
      status: item.status
    }
  })
}

/** 保存某一个 kind */
async function save(kind: GroupKind) {
  if (!canSave(kind)) return
  const label = TABS.find(tab => tab.kind === kind)?.label ?? kind
  savingKind.value = kind
  saveError[kind] = ''
  saveSuccess[kind] = ''
  try {
    await requestFetch('/api/admin/settings', {
      method: 'PUT',
      body: { kind, items: buildPayload(kind) }
    })
    saveSuccess[kind] = `${label}已保存`
    // 重新拉取：让 mediaUrl 等联表字段回到服务端的真实值
    await retry(kind)
  } catch (cause) {
    saveError[kind] = apiErrorMessage(cause) || '保存失败，请稍后重试'
  } finally {
    savingKind.value = ''
  }
}

// ---------------------------------------------------------------------------
// home_stats 结构化编辑器
// ---------------------------------------------------------------------------

function addStat() {
  homeStats.value.push({ value: '', label: '', description: '', emphasis: false })
  saveSuccess.home = ''
}

function removeStat(index: number) {
  homeStats.value.splice(index, 1)
  saveSuccess.home = ''
}

function addCoreAdvantage() {
  coreAdvantages.value.push({ title: '', description: '', highlights: [] })
  saveSuccess.home = ''
}

function removeCoreAdvantage(index: number) {
  coreAdvantages.value.splice(index, 1)
  saveSuccess.home = ''
}

function moveCoreAdvantage(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= coreAdvantages.value.length) return
  const [moved] = coreAdvantages.value.splice(index, 1)
  if (moved) coreAdvantages.value.splice(target, 0, moved)
  saveSuccess.home = ''
}

function addCoreHighlight(entry: CoreAdvantageEditorEntry) {
  entry.highlights.push({ text: '', enabled: true })
  saveSuccess.home = ''
}

function removeCoreHighlight(entry: CoreAdvantageEditorEntry, index: number) {
  entry.highlights.splice(index, 1)
  saveSuccess.home = ''
}

/** 上移 / 下移：与相邻项交换位置 */
function moveStat(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= homeStats.value.length) return
  const [moved] = homeStats.value.splice(index, 1)
  if (moved) homeStats.value.splice(target, 0, moved)
  saveSuccess.home = ''
}

// ---------------------------------------------------------------------------
// about_team_paragraphs 结构化编辑器
// ---------------------------------------------------------------------------

function addParagraph() {
  aboutParagraphs.value.push('')
  saveSuccess.about = ''
}

function removeParagraph(index: number) {
  aboutParagraphs.value.splice(index, 1)
  saveSuccess.about = ''
}

function moveParagraph(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= aboutParagraphs.value.length) return
  const [moved] = aboutParagraphs.value.splice(index, 1)
  if (moved !== undefined) aboutParagraphs.value.splice(target, 0, moved)
  saveSuccess.about = ''
}

// ---------------------------------------------------------------------------
// 图片上传
// ---------------------------------------------------------------------------

/** 定位某个 kind 下的配置项 */
function findItem(kind: GroupKind, key: string): SettingItem | undefined {
  return editItems[kind].value.find(item => item.key === key)
}

/** 图片地址：优先展示本地上传结果，其次接口联表返回的 mediaUrl */
function imageUrl(kind: GroupKind, key: string): string {
  return uploadedUrls[`${kind}:${key}`] || findItem(kind, key)?.mediaUrl || ''
}

/** 上传用途范围：Logo 与页面背景、通用分开声明 */
function imageScope(kind: GroupKind): 'logo' | 'background' | 'about' {
  if (kind === 'site') return 'logo'
  if (kind === 'about') return 'about'
  return 'background'
}

function onImageUploaded(kind: GroupKind, key: string, payload: { mediaId: number, mediaUrl: string }) {
  // 服务端只持久化 mediaId，所以拿到后先写回配置项，保存时才带得出去
  const item = findItem(kind, key)
  if (item) item.mediaId = payload.mediaId
  uploadedUrls[`${kind}:${key}`] = payload.mediaUrl
  saveSuccess[kind] = ''
  saveError[kind] = ''
}

function onImageUploading(key: string, value: boolean) {
  if (value) {
    if (!uploadingKeys.value.includes(key)) uploadingKeys.value = [...uploadingKeys.value, key]
    return
  }
  uploadingKeys.value = uploadingKeys.value.filter(entry => entry !== key)
}

/** 结构化编辑器：home_stats 与 about_team_paragraphs 各有一套专用编辑区 */
function isJsonEditor(kind: GroupKind, key: string): boolean {
  return (kind === 'home' && key === 'home_stats')
    || (kind === 'home' && key === 'home_core_advantages')
    || (kind === 'about' && key === 'about_team_paragraphs')
}

/**
 * 多图字段：在库中是 URL 字符串数组（value_type=json），
 * 改用 AdminImageListField 编辑，交互与 logo 一致（显示图片 + 每张后面选择文件）。
 *
 * 为什么不能把它们改成 value_type='image'：
 * image 只关联一个 media_id，装不下多图（lecture 有 14 张），改类型会直接丢图。
 */


/** 长文本（> 80 字）用 textarea，短文本用单行输入 */
function useTextarea(value: string): boolean {
  return value.length > 80
}

const STATUS_OPTIONS = [
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'archived', label: '已归档' }
]
</script>

<template>
  <PageContainer class="admin-settings" size="wide">
    <header class="admin-settings__head">
      <h1 class="admin-settings__title">站点设置</h1>
      <p class="admin-settings__desc">
        维护站点基础信息、首页文案与关于我们配置。每类配置单独保存，保存成功后立即生效。
      </p>
    </header>

    <p v-if="!writable" class="admin-settings__readonly" role="note">
      {{ readOnlyNotice }}（当前角色对站点配置只有读取权限，所有输入框与保存按钮均已禁用）。
    </p>

    <div class="admin-settings__tabs" role="tablist" aria-label="站点设置分类">
      <button
        v-for="tab in TABS"
        :id="`settings-tab-${tab.kind}`"
        :key="tab.kind"
        type="button"
        role="tab"
        class="admin-settings__tab"
        :class="{ 'admin-settings__tab--active': activeKind === tab.kind }"
        :aria-selected="activeKind === tab.kind"
        :aria-controls="`settings-panel-${tab.kind}`"
        @click="activeKind = tab.kind"
      >
        {{ tab.label }}
      </button>
    </div>

    <section
      v-for="tab in TABS"
      v-show="activeKind === tab.kind"
      :id="`settings-panel-${tab.kind}`"
      :key="tab.kind"
      class="admin-settings__panel"
      role="tabpanel"
      :aria-labelledby="`settings-tab-${tab.kind}`"
      tabindex="0"
    >
      <BaseCard :title="tab.label" :title-level="2">
        <p class="admin-settings__panel-desc">{{ tab.description }}</p>

        <ErrorState
          v-if="groupErrors[tab.kind]"
          title="配置加载失败"
          :message="loadErrorMessage(groupErrors[tab.kind], tab.label)"
          @retry="retry(tab.kind)"
        />

        <template v-else>
          <p v-if="blockReason(tab.kind)" class="admin-settings__alert" role="alert">
            {{ blockReason(tab.kind) }}
          </p>

          <div class="admin-settings__fields">
            <div v-for="item in editItems[tab.kind].value" :key="item.key" class="admin-settings__field">
              <div class="admin-settings__field-head">
                <label class="admin-settings__label" :for="`setting-${tab.kind}-${item.key}`">
                  {{ item.key }}
                </label>
                <span class="admin-settings__badge">{{ item.valueType }}</span>
              </div>

              <!-- image：只接上传，值由 media_id 关联 -->
              <template v-if="item.valueType === 'image'">
                <p class="admin-settings__hint">
                  图片类配置：选择文件后由浏览器直传对象存储，上传成功后需再点击「保存」才会写入配置。
                </p>
                <SettingImageField
                  :input-id="`setting-image-${tab.kind}-${item.key}`"
                  :label="item.key"
                  :media-url="imageUrl(tab.kind, item.key)"
                  :disabled="controlsDisabled || savingKind !== ''"
                  :usage-scope="imageScope(tab.kind)"
                  @uploaded="payload => onImageUploaded(tab.kind, item.key, payload)"
                  @uploading="value => onImageUploading(`${tab.kind}:${item.key}`, value)"
                />
              </template>

              <!-- 多图字段：逐张显示 + 每张后面选择文件（与 logo 同一交互方式） -->
              <template v-else-if="isImageListKey(item.key)">
                <div v-if="blockingErrors[`${tab.kind}:${item.key}`]" class="admin-settings__json-block">
                  <p class="admin-settings__hint">
                    图片控件已停用：库中原始值无法解析，请参考上方错误提示处理。
                  </p>
                </div>
                <AdminImageListField
                  v-else
                  :input-id="`setting-images-${tab.kind}-${item.key}`"
                  :label="item.key"
                  :images="imageLists[item.key] ?? []"
                  :disabled="controlsDisabled || savingKind !== ''"
                  usage-scope="about"
                  @update:images="onImagesChanged(item.key, $event)"
                  @uploading="value => onImagesUploading(item.key, value)"
                />
              </template>

              <!-- json：专用结构化编辑器 -->
              <template v-else-if="isJsonEditor(tab.kind, item.key)">
                <div v-if="blockingErrors[`${tab.kind}:${item.key}`]" class="admin-settings__json-block">
                  <p class="admin-settings__hint">
                    结构化编辑区已停用：库中原始值无法解析，请参考上方错误提示处理。
                  </p>
                </div>

                <!-- home_stats：数组 of { value, label, description, emphasis } -->
                <div v-else-if="item.key === 'home_stats'" class="admin-settings__rows">
                  <p class="admin-settings__hint">
                    共 {{ homeStats.length }} 项数据指标。可新增、删除、上下移动；勾选「强调展示」前台以主色突出。
                  </p>
                  <fieldset
                    v-for="(stat, index) in homeStats"
                    :key="`stat-${index}`"
                    class="admin-settings__row"
                  >
                    <legend class="admin-settings__row-legend">第 {{ index + 1 }} 项数据</legend>
                    <div class="admin-settings__row-grid">
                      <div class="admin-settings__cell">
                        <label class="admin-settings__cell-label" :for="`stat-${index}-value`">数值</label>
                        <input
                          :id="`stat-${index}-value`"
                          v-model="stat.value"
                          class="admin-settings__input"
                          type="text"
                          :disabled="controlsDisabled || savingKind !== ''"
                          placeholder="例如：7 年"
                        >
                      </div>
                      <div class="admin-settings__cell">
                        <label class="admin-settings__cell-label" :for="`stat-${index}-label`">指标名称</label>
                        <input
                          :id="`stat-${index}-label`"
                          v-model="stat.label"
                          class="admin-settings__input"
                          type="text"
                          :disabled="controlsDisabled || savingKind !== ''"
                          placeholder="例如：行业深耕"
                        >
                      </div>
                      <div class="admin-settings__cell admin-settings__cell--wide">
                        <label class="admin-settings__cell-label" :for="`stat-${index}-desc`">说明</label>
                        <input
                          :id="`stat-${index}-desc`"
                          v-model="stat.description"
                          class="admin-settings__input"
                          type="text"
                          :disabled="controlsDisabled || savingKind !== ''"
                          placeholder="例如：专注从事跨境电商法律咨询服务"
                        >
                      </div>
                      <div class="admin-settings__cell admin-settings__cell--inline">
                        <input
                          :id="`stat-${index}-emphasis`"
                          v-model="stat.emphasis"
                          type="checkbox"
                          :disabled="controlsDisabled || savingKind !== ''"
                        >
                        <label class="admin-settings__cell-label" :for="`stat-${index}-emphasis`">强调展示</label>
                      </div>
                    </div>
                    <div class="admin-settings__row-actions">
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === 0"
                        @click="moveStat(index, -1)"
                      >
                        上移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === homeStats.length - 1"
                        @click="moveStat(index, 1)"
                      >
                        下移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @click="removeStat(index)"
                      >
                        删除
                      </BaseButton>
                    </div>
                  </fieldset>
                  <p v-if="homeStats.length === 0" class="admin-settings__hint">暂无数据指标。</p>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="controlsDisabled || savingKind !== ''"
                    @click="addStat"
                  >
                    新增一项
                  </BaseButton>
                </div>

                <!-- home_core_advantages：核心优势与可选重点片段 -->
                <div v-else-if="item.key === 'home_core_advantages'" class="admin-settings__rows">
                  <p class="admin-settings__hint">
                    共 {{ coreAdvantages.length }} 项核心优势。描述中的重点片段勾选后，官网将以加粗黑色显示。
                  </p>
                  <fieldset
                    v-for="(advantage, index) in coreAdvantages"
                    :key="`advantage-${index}`"
                    class="admin-settings__row"
                  >
                    <legend class="admin-settings__row-legend">第 {{ index + 1 }} 项优势</legend>
                    <div class="admin-settings__cell">
                      <label class="admin-settings__cell-label" :for="`advantage-${index}-title`">标题</label>
                      <input
                        :id="`advantage-${index}-title`"
                        v-model="advantage.title"
                        class="admin-settings__input"
                        type="text"
                        :disabled="controlsDisabled || savingKind !== ''"
                      >
                    </div>
                    <div class="admin-settings__cell">
                      <label class="admin-settings__cell-label" :for="`advantage-${index}-description`">展开说明</label>
                      <textarea
                        :id="`advantage-${index}-description`"
                        v-model="advantage.description"
                        class="admin-settings__textarea"
                        rows="3"
                        :disabled="controlsDisabled || savingKind !== ''"
                      />
                    </div>
                    <div class="admin-settings__cell">
                      <span class="admin-settings__cell-label">重点片段</span>
                      <label
                        v-for="(highlight, highlightIndex) in advantage.highlights"
                        :key="`advantage-${index}-highlight-${highlightIndex}`"
                        class="admin-settings__inline-option"
                      >
                        <input
                          v-model="highlight.enabled"
                          type="checkbox"
                          :disabled="controlsDisabled || savingKind !== ''"
                        >
                        <input
                          v-model="highlight.text"
                          class="admin-settings__input"
                          type="text"
                          placeholder="例如：30、8年、上万起TRO"
                          :disabled="controlsDisabled || savingKind !== ''"
                        >
                        <BaseButton
                          variant="ghost"
                          size="sm"
                          :disabled="controlsDisabled || savingKind !== ''"
                          @click="removeCoreHighlight(advantage, highlightIndex)"
                        >
                          删除
                        </BaseButton>
                      </label>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @click="addCoreHighlight(advantage)"
                      >
                        新增重点片段
                      </BaseButton>
                    </div>
                    <div class="admin-settings__row-actions">
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === 0"
                        @click="moveCoreAdvantage(index, -1)"
                      >
                        上移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === coreAdvantages.length - 1"
                        @click="moveCoreAdvantage(index, 1)"
                      >
                        下移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @click="removeCoreAdvantage(index)"
                      >
                        删除
                      </BaseButton>
                    </div>
                  </fieldset>
                  <p v-if="coreAdvantages.length === 0" class="admin-settings__hint">暂无核心优势。</p>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="controlsDisabled || savingKind !== ''"
                    @click="addCoreAdvantage"
                  >
                    新增一项优势
                  </BaseButton>
                </div>

                <!-- about_team_paragraphs：字符串数组 -->
                <div v-else class="admin-settings__rows">
                  <p class="admin-settings__hint">
                    共 {{ aboutParagraphs.length }} 段团队介绍。可新增、删除、上下移动。
                  </p>
                  <div
                    v-for="(paragraph, index) in aboutParagraphs"
                    :key="`paragraph-${index}`"
                    class="admin-settings__row"
                  >
                    <label class="admin-settings__cell-label" :for="`paragraph-${index}`">
                      第 {{ index + 1 }} 段
                    </label>
                    <textarea
                      :id="`paragraph-${index}`"
                      v-model="aboutParagraphs[index]"
                      class="admin-settings__textarea"
                      rows="3"
                      :disabled="controlsDisabled || savingKind !== ''"
                    />
                    <div class="admin-settings__row-actions">
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === 0"
                        @click="moveParagraph(index, -1)"
                      >
                        上移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== '' || index === aboutParagraphs.length - 1"
                        @click="moveParagraph(index, 1)"
                      >
                        下移
                      </BaseButton>
                      <BaseButton
                        variant="ghost"
                        size="sm"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @click="removeParagraph(index)"
                      >
                        删除
                      </BaseButton>
                    </div>
                  </div>
                  <p v-if="aboutParagraphs.length === 0" class="admin-settings__hint">暂无段落。</p>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="controlsDisabled || savingKind !== ''"
                    @click="addParagraph"
                  >
                    新增一段
                  </BaseButton>
                </div>
              </template>

              <!-- text：长文本用 textarea -->
              <template v-else>
                <textarea
                  v-if="useTextarea(item.value)"
                  :id="`setting-${tab.kind}-${item.key}`"
                  v-model="item.value"
                  class="admin-settings__textarea"
                  rows="4"
                  :disabled="controlsDisabled || savingKind !== ''"
                />
                <input
                  v-else
                  :id="`setting-${tab.kind}-${item.key}`"
                  v-model="item.value"
                  class="admin-settings__input"
                  type="text"
                  :disabled="controlsDisabled || savingKind !== ''"
                >
                <div class="admin-settings__status">
                  <label class="admin-settings__cell-label" :for="`status-${tab.kind}-${item.key}`">状态</label>
                  <select
                    :id="`status-${tab.kind}-${item.key}`"
                    v-model="item.status"
                    class="admin-settings__select"
                    :disabled="controlsDisabled || savingKind !== ''"
                  >
                    <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </template>
            </div>
          </div>

          <p v-if="saveSuccess[tab.kind]" class="admin-settings__success" role="status">
            {{ saveSuccess[tab.kind] }}
          </p>
          <p v-if="saveError[tab.kind]" class="admin-settings__error" role="alert">
            {{ saveError[tab.kind] }}
          </p>

          <div class="admin-settings__actions">
            <BaseButton :disabled="!canSave(tab.kind)" @click="save(tab.kind)">
              {{ saveLabel(tab.kind) }}
            </BaseButton>
            <span v-if="savingKind === tab.kind" class="admin-settings__hint" role="status">
              保存中，请勿关闭页面…
            </span>
            <span v-else-if="dirty[tab.kind] && !blockReason(tab.kind)" class="admin-settings__hint">
              有未保存的修改
            </span>
          </div>
        </template>
      </BaseCard>
    </section>

  </PageContainer>
</template>

<style scoped>
.admin-settings {
  padding-block: var(--space-8) var(--space-16);
}

.admin-settings__head {
  margin-bottom: var(--space-6);
}

.admin-settings__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-settings__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-settings__readonly {
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-settings__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-settings__tab {
  padding: var(--space-3) var(--space-5);
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background-color: transparent;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
}

.admin-settings__tab--active {
  border-color: var(--color-border);
  background-color: var(--color-bg-page);
  color: var(--color-primary);
}

.admin-settings__panel:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.admin-settings__panel-desc {
  margin-bottom: var(--space-5);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-settings__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.admin-settings__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-settings__field-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.admin-settings__label {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
}

.admin-settings__badge {
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.admin-settings__input,
.admin-settings__textarea,
.admin-settings__select {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-settings__textarea {
  line-height: var(--leading-normal);
  resize: vertical;
}

.admin-settings__select {
  max-width: 200px;
}

.admin-settings__input:disabled,
.admin-settings__textarea:disabled,
.admin-settings__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-settings__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-settings__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-settings__rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.admin-settings__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
}

.admin-settings__row-legend {
  padding-inline: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text-muted);
}

.admin-settings__row-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
}

.admin-settings__cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.admin-settings__cell--wide {
  grid-column: span 2;
}

.admin-settings__cell--inline {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
  grid-column: span 2;
}

.admin-settings__inline-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.admin-settings__inline-option .admin-settings__input {
  flex: 1;
}

.admin-settings__cell-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text);
}

.admin-settings__row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.admin-settings__alert {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-settings__success {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-settings__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-settings__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.admin-settings__json-block {
  padding: var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

</style>
