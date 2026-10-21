<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { HomeStatEntry, SettingItem } from '~/types/adminSettings'
import {
  normalizeContentSidebar,
  normalizeLegalGuideSlides,
  type ContentSidebarConfig,
  type LegalGuideSlide,
} from '~/utils/contentSettings'
import {
  DEFAULT_SITE_THEME,
  SITE_THEME_PRESETS,
  isValidSiteThemeHex,
  normalizeSiteTheme,
  siteThemeCssVariables,
  type SiteTheme,
  type SiteThemePreset,
} from '~/utils/siteTheme'
import { apiErrorMessage, httpStatusOf } from '~/utils/publicApi'
import { SETTINGS_READ_ONLY_NOTICE, canWriteSettings } from '~/utils/adminPermission'
import AdminSitePublishingSettings from '~/components/admin/SitePublishingSettings.vue'
import AdminServicesSettings from '~/components/admin/AdminServicesSettings.vue'

/**
 * 站点设置：站点 / 首页 / 关于三类 key-value 文案配置。
 *
 * 数据来源：GET /api/admin/settings?kind=<site|home|about>
 * 保存：PUT /api/admin/settings（body { kind, items }，每个 kind 一个保存按钮）
 *
 * 关键约定（见 docs/superpowers/task7-admin-contract.md 第一节）：
 * - `value` 是**库中原始字符串**，接口不做 JSON 解析；`valueType: 'json'` 的项
 *   由本页 JSON.parse 成结构化编辑器、保存时再 JSON.stringify 回去。
 * - `valueType: 'image'` 的项：展示地址取联表返回的 `mediaUrl` 或初始静态素材路径，
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

/** 三类文案配置；二维码作为独立展示标签，保存仍走现有二维码接口。 */
type GroupKind = 'site' | 'home' | 'about'
type SettingsTabKind = GroupKind | 'qr' | 'services'

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
const route = useRoute()
const { user } = useAdminSession()

const TABS: { kind: SettingsTabKind, label: string }[] = [
  { kind: 'site', label: '站点信息' },
  { kind: 'home', label: '首页内容' },
  { kind: 'about', label: '关于我们' },
  { kind: 'qr', label: '二维码管理' },
  { kind: 'services', label: '团队业务范围' }
]

/** 默认展开第一个 tab */
const activeKind = ref<SettingsTabKind>(route.query.tab === 'services' ? 'services' : 'site')

const SETTING_LABELS: Record<string, string> = {
  site_name: '网站名称', site_subtitle: '网站副标题', site_description: '网站简介', site_logo: '网站 Logo', site_favicon: '浏览器标签页图标',
  contact_phone: '联系电话', contact_email: '联系邮箱', contact_address: '联系地址', contact_wechat: '联系微信号',
  footer_intro: '页脚团队简介', footer_registration: '备案信息', footer_qr_primary: '页脚二维码一', footer_qr_secondary: '页脚二维码二',
  content_sidebar: '', site_theme: '公开页面配色',
  home_hero_badge: '首屏眉题', home_hero_title: '首屏标题图片', home_hero_subtitle: '首屏介绍',
  home_hero_primary_label: '主按钮文字', home_hero_primary_link: '主按钮链接',
  home_hero_secondary_label: '次按钮文字', home_hero_background: '首页动态背景视频',
  home_team_background: '团队介绍背景图', home_team_title: '团队介绍标题', home_team_paragraphs: '团队介绍正文', home_team_features: '团队介绍亮点（多行，已拆分为下面四项）', home_team_feature_1: '亮点一', home_team_feature_2: '亮点二', home_team_feature_3: '亮点三', home_team_feature_4: '亮点四',
  home_hero_background_poster: '首页背景视频封面', home_stats: '首页数据指标',
  home_core_advantages: '首页核心优势', home_legal_guides: '普法干货轮播',
  home_consultation_title: '咨询区域标题', home_consultation_description: '咨询区域说明', home_consultation_button: '咨询按钮文字',
  about_hero_welcome: '关于我们引导语', about_hero_title: '关于我们标题', about_hero_image: '关于我们主图',
  about_team_title: '团队介绍标题', about_team_paragraphs: '团队介绍内容',
  about_contact_title: '主图联系引导文案', about_success_title: '成功案例标题', about_success_images: '成功案例图片',
  about_lecture_title: '企业宣讲标题', about_lecture_images: '企业宣讲图片',
  about_partner_title: '合作伙伴标题', about_partner_images: '合作伙伴 Logo'
}

const SETTING_GROUPS: Record<GroupKind, { id: string, title: string, keys: string[] }[]> = {
  site: [
    { id: 'brand', title: '品牌与网站资料', keys: ['site_name', 'site_logo', 'site_favicon', 'site_subtitle', 'site_description'] },
    { id: 'contact', title: '联系方式', keys: ['contact_phone', 'contact_wechat', 'contact_email', 'contact_address'] },
    { id: 'content', title: '常见问题与页面配色', keys: ['content_sidebar', 'site_theme'] },
    { id: 'footer-intro', title: '页脚信息', keys: ['footer_intro', 'footer_registration', 'footer_qr_primary', 'footer_qr_secondary'] }
  ],
  home: [
    { id: 'hero', title: '首页首屏', keys: ['home_hero_badge', 'home_hero_title', 'home_hero_subtitle', 'home_hero_primary_label', 'home_hero_primary_link', 'home_hero_secondary_label', 'home_hero_background', 'home_hero_background_poster'] },
    { id: 'home-team', title: '首页团队介绍', keys: ['home_team_background', 'home_team_title', 'home_team_paragraphs', 'home_team_feature_1', 'home_team_feature_2', 'home_team_feature_3', 'home_team_feature_4'] },
    { id: 'stats', title: '首页数据指标', keys: ['home_stats'] },
    { id: 'advantages', title: '核心优势', keys: ['home_core_advantages'] },
    { id: 'guides', title: '普法干货轮播', keys: ['home_legal_guides'] },
    { id: 'consultation', title: '咨询区域', keys: ['home_consultation_title', 'home_consultation_description', 'home_consultation_button'] }
  ],
  about: [
    { id: 'team', title: '团队介绍', keys: ['about_team_title', 'about_team_paragraphs'] },
    { id: 'about-hero', title: '关于我们主图与介绍', keys: ['about_hero_welcome', 'about_hero_title', 'about_hero_image', 'about_contact_title'] },
    { id: 'success', title: '成功案例', keys: ['about_success_title', 'about_success_images'] },
    { id: 'partners', title: '企业宣讲与合作伙伴', keys: ['about_lecture_title', 'about_lecture_images', 'about_partner_title', 'about_partner_images'] }
  ]
}

const writable = computed(() => canWriteSettings(user.value?.roles))
const readOnlyNotice = SETTINGS_READ_ONLY_NOTICE
const controlsDisabled = computed(() => !writable.value)

/** 三类配置的本地编辑态 */
const editItems = {
  site: ref<SettingItem[]>([]),
  home: ref<SettingItem[]>([]),
  about: ref<SettingItem[]>([]),
}

function settingLabel(key: string): string {
  return SETTING_LABELS[key] ?? '其他配置项'
}

function moveSidebarLink(index: number, delta: number) {
  const links = contentSidebar.value.faqLinks
  const target = index + delta
  if (target < 0 || target >= links.length) return
  const [item] = links.splice(index, 1)
  if (item) links.splice(target, 0, item)
  links.forEach((link, position) => { link.sortOrder = (position + 1) * 10 })
}

function settingsGroups(kind: GroupKind) {
  const items = editItems[kind].value
  const groups = SETTING_GROUPS[kind].map(group => ({
    ...group,
    items: group.keys.flatMap(key => items.filter(item => item.key === key))
  })).filter(group => group.items.length > 0)
  const knownKeys = new Set(SETTING_GROUPS[kind].flatMap(group => group.keys))
  const remaining = items.filter(item => !knownKeys.has(item.key))
  if (remaining.length) {
    groups.push({
      id: 'other', title: '其他页面内容', keys: [], items: remaining
    })
  }
  return groups
}

/** 已下线的历史配置不进入后台编辑态，避免继续暴露给管理员。 */
const HIDDEN_SETTING_KEYS = new Set([
  'home_banner_image',
  'home_right_image',
  'about_hero_paragraph',
  'about_business_images',
  'about_honors_images',
  'about_team_image',
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
/** 首页团队介绍正文：按换行拆成多段，用带按钮的段落编辑器维护 */
const homeParagraphs = ref<string[]>([])

function splitTextParagraphs(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function moveHomeParagraph(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= homeParagraphs.value.length) return
  const [moved] = homeParagraphs.value.splice(index, 1)
  if (moved !== undefined) homeParagraphs.value.splice(target, 0, moved)
}
const coreAdvantages = ref<CoreAdvantageEditorEntry[]>([])
const contentSidebar = ref<ContentSidebarConfig>(normalizeContentSidebar(null))
const legalGuides = ref<LegalGuideSlide[]>(normalizeLegalGuideSlides(null))
const siteTheme = ref<SiteTheme>(normalizeSiteTheme(null))
const siteThemePreview = computed(() => siteThemeCssVariables(siteTheme.value))
const siteThemeInputError = computed(() => siteTheme.value.preset === 'custom' && !isValidSiteThemeHex(siteTheme.value.primary))
const GUIDE_QR_OPTIONS = [
  { key: 'qr-tro-public', label: 'TRO 公众号' },
  { key: 'qr-tro-consult', label: 'TRO 咨询号' },
  { key: 'qr-labor-public', label: '劳动法公众号' },
  { key: 'qr-labor-consult', label: '劳动法咨询号' },
  { key: '', label: '不显示二维码' },
] as const
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
    blockingErrors['home:home_stats'] = '首页数据指标配置格式无效，结构化编辑已停用并禁止保存，请先修复该配置。'
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors['home:home_stats'] = '首页数据指标配置不是列表，结构化编辑已停用并禁止保存，请先修复该配置。'
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
    blockingErrors['about:about_team_paragraphs'] = '团队介绍内容格式无效，结构化编辑已停用并禁止保存，请先修复该配置。'
    return []
  }
  if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'string')) {
    blockingErrors['about:about_team_paragraphs'] = '团队介绍内容格式不是段落列表，结构化编辑已停用并禁止保存，请先修复该配置。'
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
    blockingErrors['home:home_core_advantages'] = '首页核心优势配置格式无效，结构化编辑已停用并禁止保存，请先修复该配置。'
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors['home:home_core_advantages'] = '首页核心优势配置不是列表，结构化编辑已停用并禁止保存，请先修复该配置。'
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

function parseContentSidebar(items: SettingItem[]): ContentSidebarConfig {
  const item = items.find(entry => entry.key === 'content_sidebar')
  if (!item || !item.value.trim()) return normalizeContentSidebar(null)
  try {
    return normalizeContentSidebar(JSON.parse(item.value))
  } catch {
    blockingErrors['site:content_sidebar'] = '内容页常见问题配置格式无效，结构化编辑已停用并禁止保存，请先修复该配置。'
    return normalizeContentSidebar(null)
  }
}

function parseSiteTheme(items: SettingItem[]): SiteTheme {
  const item = items.find(entry => entry.key === 'site_theme')
  if (!item || !item.value.trim()) return normalizeSiteTheme(null)
  try {
    return normalizeSiteTheme(JSON.parse(item.value))
  } catch {
    blockingErrors['site:site_theme'] = '公开页面配色配置格式无效，暂时使用默认红色；请先修复该配置。'
    return normalizeSiteTheme(null)
  }
}

function parseLegalGuides(items: SettingItem[]): LegalGuideSlide[] {
  const item = items.find(entry => entry.key === 'home_legal_guides')
  if (!item || !item.value.trim()) return normalizeLegalGuideSlides(null)
  try {
    return normalizeLegalGuideSlides(JSON.parse(item.value))
  } catch {
    blockingErrors['home:home_legal_guides'] = '普法干货轮播配置格式无效，结构化编辑已停用并禁止保存，请先修复该配置。'
    return normalizeLegalGuideSlides(null)
  }
}

function serializeCoreAdvantages() {
  return coreAdvantages.value.map(entry => ({
    title: entry.title,
    description: entry.description,
    highlights: entry.highlights.filter(option => option.enabled && option.text.trim()).map(option => option.text.trim())
  }))
}

/** 多图字段：图片控件里的 URL 数组需要参与脏检查，否则上传/删除后保存按钮一直是「暂无修改」 */
const IMAGE_LIST_KEYS = [
  'about_hero_image',
  'about_success_images',
  'about_lecture_images',
  'about_partner_images',
] as const

function isImageListKey(key: string): boolean {
  return (IMAGE_LIST_KEYS as readonly string[]).includes(key)
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
    if (kind === 'site' && item.key === 'content_sidebar') {
      return { ...item, value: JSON.stringify(contentSidebar.value) }
    }
    if (kind === 'site' && item.key === 'site_theme') {
      return { ...item, value: JSON.stringify(siteTheme.value) }
    }
    if (kind === 'home' && item.key === 'home_legal_guides') {
      return { ...item, value: JSON.stringify(legalGuides.value) }
    }
    if (kind === 'home' && item.key === 'home_team_paragraphs') {
      return { ...item, value: homeParagraphs.value.join('\n') }
    }
    if (kind === 'about' && item.key === 'about_team_paragraphs') {
      return { ...item, value: JSON.stringify(aboutParagraphs.value) }
    }
    // 多图字段必须参与脏检查：buildPayload 会用 imageLists 覆盖 value，
    // 若 snapshot 忽略它，上传/删除图片后 dirty 永远为 false，保存按钮不可用。
    if (kind === 'about' && isImageListKey(item.key)) {
      return { ...item, value: JSON.stringify(imageLists[item.key] ?? []) }
    }
    return { ...item }
  })
  return JSON.stringify(items)
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
    blockingErrors[`about:${key}`] = `${settingLabel(key)}配置格式无效，无法用图片控件编辑；为保护原数据，已禁止保存，请先修复该配置。`
    return []
  }
  if (!Array.isArray(parsed)) {
    blockingErrors[`about:${key}`] = `${settingLabel(key)}配置不是图片列表，无法用图片控件编辑；为保护原数据，已禁止保存，请先修复该配置。`
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
  if (kind === 'site') contentSidebar.value = parseContentSidebar(items)
  if (kind === 'site') siteTheme.value = parseSiteTheme(items)
  if (kind === 'home') legalGuides.value = parseLegalGuides(items)
  if (kind === 'about') {
    aboutParagraphs.value = parseParagraphs(items)
    for (const key of IMAGE_LIST_KEYS) {
      imageLists[key] = parseImageList(items, key)
    }
  }
  editItems[kind].value = items
  const homeBodyItem = items.find(entry => entry.key === 'home_team_paragraphs')
  if (homeBodyItem) homeParagraphs.value = splitTextParagraphs(homeBodyItem.value)
  baseline[kind] = snapshot(kind)
  return items
}

/**
 * 三类数据分别用稳定的 key 取数；三个面板都渲染，切换不会丢失未保存的编辑。
 *
 * 注意：**不能把 applyGroup 放在 useAsyncData 的 transform 里**。
 * transform 只在真正发起请求时执行；整页加载（SSR + hydration）时客户端命中
 * 序列化缓存、不会再跑 transform，于是 editItems 一直是空数组 ——
 * 表现就是「直接打开或刷新 /admin/settings 整页空白，只有从别的后台页点进来才正常」。
 * 改为 watch 原始 payload：SSR 与客户端都会执行一次副作用，两种进入方式表现一致。
 */
const { data: sitePayload, error: siteError, refresh: refreshSite } = await useAsyncData(
  'admin-settings-site',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'site' } })
)
const { data: homePayload, error: homeError, refresh: refreshHome } = await useAsyncData(
  'admin-settings-home',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'home' } })
)
const { data: aboutPayload, error: aboutError, refresh: refreshAbout } = await useAsyncData(
  'admin-settings-about',
  () => requestFetch<{ data: GroupPayload }>('/api/admin/settings', { query: { kind: 'about' } })
)

/** 只在与 DOM 无关的时机应用数据，供 watch 的 immediate 调用。 */
function applyIfReady(kind: GroupKind, payload: { data: GroupPayload } | null | undefined) {
  if (!payload?.data?.items) return
  applyGroup(kind, payload)
}

watch(sitePayload, payload => applyIfReady('site', payload), { immediate: true })
watch(homePayload, payload => applyIfReady('home', payload), { immediate: true })
watch(aboutPayload, payload => applyIfReady('about', payload), { immediate: true })
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
    && !(kind === 'site' && siteThemeInputError.value)
}

/** 保存按钮文案（禁用原因直接写在按钮上，避免用户误以为按钮失灵） */
function saveLabel(kind: GroupKind): string {
  if (savingKind.value === kind) return '保存中…'
  if (!writable.value) return '保存（只读角色不可用）'
  if (blockReason(kind)) return '保存（请先修复解析错误）'
  if (kind === 'site' && siteThemeInputError.value) return '保存（颜色需为六位 HEX）'
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
    if (kind === 'site' && item.key === 'content_sidebar') {
      value = JSON.stringify(contentSidebar.value)
    }
    if (kind === 'site' && item.key === 'site_theme') {
      value = JSON.stringify(siteTheme.value)
    }
    if (kind === 'home' && item.key === 'home_legal_guides') {
      value = JSON.stringify(legalGuides.value)
    }
    if (kind === 'home' && item.key === 'home_team_paragraphs') {
      value = homeParagraphs.value.join('\n')
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

function addGuideParagraph(guide: LegalGuideSlide) {
  guide.paragraphs.push('')
  saveSuccess.home = ''
}

function removeGuideParagraph(guide: LegalGuideSlide, index: number) {
  guide.paragraphs.splice(index, 1)
  saveSuccess.home = ''
}

function onGuideImageUploading(slug: string, value: boolean) {
  onImageUploading(`home:home_legal_guides:${slug}`, value)
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
  const item = findItem(kind, key)
  return uploadedUrls[`${kind}:${key}`] || item?.mediaUrl || item?.value || ''
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

function onSettingImageUploaded(kind: SettingsTabKind, key: string, payload: { mediaId: number, mediaUrl: string }) {
  if (kind === 'qr' || kind === 'services') return
  onImageUploaded(kind, key, payload)
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
    || (kind === 'site' && key === 'content_sidebar')
    || (kind === 'site' && key === 'site_theme')
    || (kind === 'home' && key === 'home_legal_guides')
    || (kind === 'about' && key === 'about_team_paragraphs')
    || (kind === 'home' && key === 'home_team_paragraphs')
}

function onSiteThemePresetChange(event: Event) {
  const preset = (event.target as HTMLSelectElement).value as SiteThemePreset
  if (preset === 'custom') {
    siteTheme.value = {
      preset,
      primary: isValidSiteThemeHex(siteTheme.value.primary) ? siteTheme.value.primary.toUpperCase() : DEFAULT_SITE_THEME.primary,
    }
  } else if (preset in SITE_THEME_PRESETS) {
    const selected = SITE_THEME_PRESETS[preset as keyof typeof SITE_THEME_PRESETS]
    siteTheme.value = { preset, primary: selected.primary }
  }
  saveSuccess.site = ''
}

function onSiteThemePrimaryInput(value: string) {
  siteTheme.value = { preset: 'custom', primary: value }
  saveSuccess.site = ''
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

</script>

<template>
  <PageContainer class="admin-settings" size="wide">
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
      <template v-if="tab.kind === 'services'">
        <AdminServicesSettings />
      </template>
      <template v-else-if="tab.kind === 'qr'">
        <AdminSitePublishingSettings />
      </template>
      <template v-else>
      <BaseCard>
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

          <div class="admin-settings__group-list">
          <section
            v-for="group in settingsGroups(tab.kind)"
            :key="group.id"
            class="admin-settings__group"
            :class="{
              'admin-settings__group--content': group.id === 'content',
              'admin-settings__group--stats': group.id === 'stats'
            }"
          >
            <header class="admin-settings__group-head">
              <h3 class="admin-settings__group-title">{{ group.title }}</h3>
            </header>
          <div class="admin-settings__fields">
            <template v-for="item in group.items" :key="item.key">
            <div class="admin-settings__field" :class="{ 'admin-settings__field--full': item.key === 'content_sidebar' }">
              <div v-if="settingLabel(item.key)" class="admin-settings__field-head">
                <label class="admin-settings__label" :for="`setting-${tab.kind}-${item.key}`">
                  {{ settingLabel(item.key) }}
                </label>
              </div>
              <div v-if="item.key === 'content_sidebar'" class="admin-settings__field-head admin-settings__field-head--center">
                <h4 class="admin-settings__sidebar-title">常见问题与二维码标题</h4>
              </div>

              <!-- image：只接上传，值由 media_id 关联 -->
              <template v-if="item.valueType === 'image'">
                <SettingImageField
                  :input-id="`setting-image-${tab.kind}-${item.key}`"
                  :label="settingLabel(item.key)"
                  :media-url="imageUrl(tab.kind, item.key)"
                  :preview-size="item.key === 'home_hero_title' ? 'wide' : 'default'"
                  :disabled="controlsDisabled || savingKind !== ''"
                  :usage-scope="imageScope(tab.kind)"
                  @uploaded="payload => onSettingImageUploaded(tab.kind, item.key, payload)"
                  @uploading="value => onImageUploading(`${tab.kind}:${item.key}`, value)"
                />
              </template>

              <!-- 多图字段：逐张显示 + 每张后面选择文件（与 logo 同一交互方式） -->
              <template v-else-if="isImageListKey(item.key)">
                <div v-if="blockingErrors[`${tab.kind}:${item.key}`]" class="admin-settings__json-block">
                </div>
                <AdminImageListField
                  v-else
                  :input-id="`setting-images-${tab.kind}-${item.key}`"
                  :label="settingLabel(item.key)"
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
                </div>

                <!-- site_theme：全站主色预设与自定义 HEX -->
                <div v-else-if="item.key === 'site_theme'" class="admin-settings__rows">
                  <div class="admin-settings__cell">
                    <label class="admin-settings__cell-label" for="site-theme-preset">配色风格</label>
                    <select
                      id="site-theme-preset"
                      :value="siteTheme.preset"
                      class="admin-settings__select"
                      :disabled="controlsDisabled || savingKind !== ''"
                      @change="onSiteThemePresetChange"
                    >
                      <option v-for="(preset, key) in SITE_THEME_PRESETS" :key="key" :value="key">{{ preset.label }}</option>
                      <option value="custom">自定义颜色</option>
                    </select>
                  </div>
                  <div class="admin-settings__cell admin-settings__cell--inline">
                    <template v-if="siteTheme.preset === 'custom'">
                      <label class="admin-settings__cell-label" for="site-theme-primary">自定义主色 HEX</label>
                      <input
                        id="site-theme-primary"
                        :value="siteThemeInputError ? DEFAULT_SITE_THEME.primary : siteTheme.primary"
                        type="color"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @input="onSiteThemePrimaryInput(($event.target as HTMLInputElement).value)"
                      >
                      <input
                        :value="siteTheme.primary"
                        class="admin-settings__input"
                        type="text"
                        inputmode="text"
                        maxlength="7"
                        placeholder="#8F5F18"
                        aria-describedby="site-theme-color-hint"
                        :disabled="controlsDisabled || savingKind !== ''"
                        @input="onSiteThemePrimaryInput(($event.target as HTMLInputElement).value)"
                      >
                    </template>
                    <template v-else>
                      <span class="admin-settings__cell-label">当前主色</span>
                      <span class="admin-settings__theme-swatch" :style="siteThemePreview" aria-hidden="true" />
                      <code>{{ siteTheme.primary }}</code>
                    </template>
                  </div>
                  <p v-if="siteThemeInputError" class="admin-settings__alert" role="alert">颜色格式无效，请输入 #RRGGBB 六位 HEX 值。</p>
                </div>

                <!-- content_sidebar：FAQ 顺序、显示状态与两类二维码标题 -->
                <div v-else-if="item.key === 'content_sidebar'" class="admin-settings__rows admin-settings__rows--sidebar">
                  <div class="admin-settings__cell">
                    <label class="admin-settings__cell-label" for="sidebar-faq-title">常见问题标题</label>
                    <input
                      id="sidebar-faq-title"
                      v-model="contentSidebar.faqTitle"
                      class="admin-settings__input"
                      type="text"
                      :disabled="controlsDisabled || savingKind !== ''"
                    >
                  </div>
                  <div class="admin-settings__cell">
                    <label class="admin-settings__cell-label" for="sidebar-public-heading">公众号二维码标题</label>
                    <input
                      id="sidebar-public-heading"
                      v-model="contentSidebar.publicHeading"
                      class="admin-settings__input"
                      type="text"
                      :disabled="controlsDisabled || savingKind !== ''"
                    >
                  </div>
                  <div class="admin-settings__cell">
                    <label class="admin-settings__cell-label" for="sidebar-consult-heading">咨询号二维码标题</label>
                    <input
                      id="sidebar-consult-heading"
                      v-model="contentSidebar.consultHeading"
                      class="admin-settings__input"
                      type="text"
                      :disabled="controlsDisabled || savingKind !== ''"
                    >
                  </div>
                  <fieldset
                    v-for="(link, index) in contentSidebar.faqLinks"
                    :key="`sidebar-link-${link.key}`"
                    class="admin-settings__row"
                  >
                    <legend class="admin-settings__row-legend">{{ link.key === 'tro' ? 'TRO 常见问题' : link.key === 'labor' ? '劳动争议' : '跨境干货' }}</legend>
                    <div class="admin-settings__row-grid">
                      <div class="admin-settings__cell admin-settings__sidebar-link-field">
                        <label class="admin-settings__cell-label" :for="`sidebar-link-${link.key}-label`">显示名称</label>
                        <input
                          :id="`sidebar-link-${link.key}-label`"
                          v-model="link.label"
                          class="admin-settings__input"
                          type="text"
                          :disabled="controlsDisabled || savingKind !== ''"
                        >
                      </div>
                      <div class="admin-settings__row-actions">
                        <BaseButton
                          variant="ghost"
                          size="sm"
                          :disabled="controlsDisabled || savingKind !== '' || index === 0"
                          @click="moveSidebarLink(index, -1)"
                        >
                          上移
                        </BaseButton>
                        <BaseButton
                          variant="ghost"
                          size="sm"
                          :disabled="controlsDisabled || savingKind !== '' || index === contentSidebar.faqLinks.length - 1"
                          @click="moveSidebarLink(index, 1)"
                        >
                          下移
                        </BaseButton>
                      </div>
                    </div>
                  </fieldset>
                </div>

                <!-- home_stats：数组 of { value, label, description, emphasis } -->
                <div v-else-if="item.key === 'home_stats'" class="admin-settings__rows">
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

                <!-- home_legal_guides：固定的 TRO、劳动法和国际物流三个主题 -->
                <div v-else-if="item.key === 'home_legal_guides'" class="admin-settings__rows">
                  <fieldset v-for="guide in legalGuides" :key="`guide-${guide.slug}`" class="admin-settings__row">
                    <legend class="admin-settings__row-legend">{{ guide.slug === 'tro' ? 'TRO 跨境' : guide.slug === 'labor' ? '劳动法' : '国际物流' }}</legend>
                    <div class="admin-settings__row-grid">
                      <div class="admin-settings__cell">
                        <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-category`">主题名称</label>
                        <input :id="`guide-${guide.slug}-category`" v-model="guide.category" class="admin-settings__input" type="text" :disabled="controlsDisabled || savingKind !== ''">
                      </div>
                      <div class="admin-settings__cell">
                        <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-title`">书本标题</label>
                        <input :id="`guide-${guide.slug}-title`" v-model="guide.title" class="admin-settings__input" type="text" :disabled="controlsDisabled || savingKind !== ''">
                      </div>
                    </div>
                    <div class="admin-settings__cell">
                      <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-image-alt`">图片说明</label>
                      <input :id="`guide-${guide.slug}-image-alt`" v-model="guide.imageAlt" class="admin-settings__input" type="text" :disabled="controlsDisabled || savingKind !== ''">
                    </div>
                    <JsonImageField
                      :model-value="guide.image"
                      :label="`${guide.category}封面`"
                      :disabled="controlsDisabled || savingKind !== ''"
                      @update:model-value="value => { guide.image = value; saveSuccess.home = '' }"
                      @uploading="value => onGuideImageUploading(guide.slug, value)"
                    />
                    <div class="admin-settings__cell">
                      <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-benefit`">领取说明</label>
                      <input :id="`guide-${guide.slug}-benefit`" v-model="guide.benefit" class="admin-settings__input" type="text" :disabled="controlsDisabled || savingKind !== ''">
                    </div>
                    <div class="admin-settings__cell admin-settings__cell--inline">
                      <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-accent`">主题色</label>
                      <input :id="`guide-${guide.slug}-accent`" v-model="guide.accent" type="color" :disabled="controlsDisabled || savingKind !== ''">
                      <code>{{ guide.accent }}</code>
                    </div>
                    <div class="admin-settings__cell">
                      <span class="admin-settings__cell-label">正文</span>
                      <div v-for="(paragraph, index) in guide.paragraphs" :key="`${guide.slug}-paragraph-${index}`" class="admin-settings__row">
                        <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-paragraph-${index}`">第 {{ index + 1 }} 段</label>
                        <textarea :id="`guide-${guide.slug}-paragraph-${index}`" v-model="guide.paragraphs[index]" class="admin-settings__textarea" rows="4" :disabled="controlsDisabled || savingKind !== ''" />
                        <BaseButton variant="ghost" size="sm" :disabled="controlsDisabled || savingKind !== ''" @click="removeGuideParagraph(guide, index)">删除本段</BaseButton>
                      </div>
                      <BaseButton variant="secondary" size="sm" :disabled="controlsDisabled || savingKind !== ''" @click="addGuideParagraph(guide)">新增正文段落</BaseButton>
                    </div>
                    <div class="admin-settings__qr-field">
                      <label class="admin-settings__cell-label" :for="`guide-${guide.slug}-qr`">领取二维码</label>
                      <select :id="`guide-${guide.slug}-qr`" v-model="guide.qrItemKey" class="admin-settings__select" :disabled="controlsDisabled || savingKind !== ''">
                        <option v-for="option in GUIDE_QR_OPTIONS" :key="option.key || 'none'" :value="option.key">{{ option.label }}</option>
                      </select>
                      <span>{{ GUIDE_QR_OPTIONS.find(option => option.key === guide.qrItemKey)?.label }}</span>
                    </div>
                  </fieldset>
                </div>

                <!-- home_team_paragraphs：换行分隔文本，带按钮的分段编辑器 -->
        <div v-else-if="item.key === 'home_team_paragraphs'" class="admin-settings__rows">
          <div v-for="(paragraph, index) in homeParagraphs" :key="`home-paragraph-${index}`" class="admin-settings__row">
            <label class="admin-settings__cell-label" :for="`home-paragraph-${index}`">第 {{ index + 1 }} 段</label>
            <textarea
              :id="`home-paragraph-${index}`"
              v-model="homeParagraphs[index]"
              class="admin-settings__input"
              rows="4"
              :disabled="controlsDisabled || savingKind !== ''"
            />
            <div class="admin-settings__row-actions">
              <button type="button" class="btn btn--ghost btn--sm" :disabled="controlsDisabled || index === 0" @click="moveHomeParagraph(index, -1)">上移</button>
              <button type="button" class="btn btn--ghost btn--sm" :disabled="controlsDisabled || index === homeParagraphs.length - 1" @click="moveHomeParagraph(index, 1)">下移</button>
              <button type="button" class="btn btn--ghost btn--sm" :disabled="controlsDisabled || savingKind !== ''" @click="homeParagraphs.splice(index, 1)">删除</button>
            </div>
          </div>
          <button type="button" class="btn btn--secondary btn--sm" :disabled="controlsDisabled || savingKind !== ''" @click="homeParagraphs.push('')">新增一段</button>
        </div>

        <!-- about_team_paragraphs：字符串数组 -->
                <div v-else class="admin-settings__rows">
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
              </template>
            </div>
            </template>
          </div>
          </section>
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
      </template>
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

.admin-settings__group-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-settings__group {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
}

.admin-settings__group-head {
  margin-bottom: var(--space-5);
}

.admin-settings__group-title {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--color-text);
}

.admin-settings__group--content .admin-settings__group-title,
.admin-settings__group--stats .admin-settings__group-title {
  font-size: 18px;
  letter-spacing: normal;
}

.admin-settings__sidebar-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: normal;
}

.admin-settings__group-desc {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-settings__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.admin-settings__field {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  align-items: start;
  column-gap: var(--space-5);
  row-gap: var(--space-2);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.admin-settings__field-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/*
 * 结构化编辑器（普法干货的正文段落、核心优势的重点片段）在 .admin-settings__field
 * 里直接渲染了多个兄弟元素（复选框行 / 新增按钮 / 上移下移删除）。
 * 两列栅格会把这些兄弟元素依次塞进「标签列」和「内容列」，于是出现
 * 「新增重点片段」掉到标签列、复选框与输入框错位、按钮看似居中这类现象。
 * 把所有非标签头的直接子元素固定到内容列并纵向堆叠，即可对齐。
 */
.admin-settings__field > *:not(.admin-settings__field-head) {
  grid-column: 2;
  min-width: 0;
}

/*
 * 「强调展示」这类只有单个复选框的单元格：标签与复选框并排显示。
 * 之前 cell 是两列栅格，复选框被推到第二列、又因行高被顶到下一行，看起来像"跑出去了"。
 */
.admin-settings__cell:has(.admin-settings__inline-option) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
/* 需要整行占满的字段（如侧栏配置）保持跨两列 */
.admin-settings__field--full > *:not(.admin-settings__field-head) {
  grid-column: 1 / -1;
}

/*
 * 真正的错位源头在这一层：.admin-settings__cell 自身是 grid，
 * 而单元格里除了 .admin-settings__cell-label 还有多个兄弟元素
 * （重点片段的复选框 label、删除按钮）。
 * 它们会被依次塞进「标签列」和「内容列」，于是按钮掉到左边、复选框与输入框错位。
 * admin.vue 里给 .admin-services__cell 写过同样的规则，但漏了 .admin-settings__cell。
 */
.admin-settings__cell > :not(.admin-settings__cell-label) {
  grid-column: 2;
  min-width: 0;
}

/*
 * 无标签的单元格（图片字段 / 主题色）里只有这一个控件，
 * 它会落进 72px 的标签列，导致比上下行输入框左移 84px。
 * 直接针对这两个控件类占满整格 —— 已实测 :has() 写法不生效，故改用直接子选择器。
 */
.admin-settings__cell > .json-image-field,
.admin-settings__cell > .admin-settings__gu-field {
  /* 从第 2 列开始（不是 1 / -1：那会让左边缘仍落在 595 的标签列） */
  grid-column: 2 / -1;
}

/*
 * 实际结构（DevTools breadcrumb 确认）：
 *   .admin-settings__field > .admin-settings__rows > fieldset.admin-settings__row > .json-image-field
 * 图片字段与主题色控件是 **fieldset 的直接子元素**，并不在 .admin-settings__cell 里，
 * 所以前面那些 cell 下的选择器全部打不中。
 * 而同一行网格里带标签的单元格会空出 72px 标签列 + 12px 间距 = 84px，
 * 于是这两个控件比上下行输入框左移 84px。这里补回同样的缩进。
 */
.admin-settings__row > .json-image-field,
.admin-settings__row > .admin-settings__gu-field {
  padding-inline-start: calc(72px + var(--space-3));
}

/*
 * 主题色单元格是 .admin-settings__cell--inline（flex），没有标签列，
 * 色块会直接贴到单元格左边，比其它输入框左移。
 * 改成与普通单元格一致的两列栅格后，标签在第 1 列、控件落在第 2 列，左边缘即与其它输入框对齐。
 */
.admin-settings__cell--inline {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--space-3);
}

.admin-settings__field-head--center {
  grid-column: 1;
  align-self: center;
  justify-content: center;
}

.admin-settings__label {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
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

.admin-settings__qr-field {
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
  min-width: 0;
  margin-top: 0;
}

.admin-settings__rows--sidebar {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
}

.admin-settings__rows--sidebar > .admin-settings__cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
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
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-1);
  min-width: 0;
}

.admin-settings__cell--wide {
  grid-column: span 2;
}

.admin-settings__cell--inline {
  /*
   * 原来是 display:flex + flex-direction:row，让「主题色」标签、色块、色值排成一行，
   * 结果色块紧贴单元格左边，比上下行输入框左移。
   * 改为与普通单元格一致的两列栅格：标签占第 1 列、控件从第 2 列开始，左边缘即对齐。
   * 注意这条规则在文件里位于前面那条 .admin-settings__cell--inline 之后，会覆盖它。
   */
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--space-3);
  grid-column: span 2;
}

@media (max-width: 760px) {
  .admin-settings__field {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--space-2);
  }

  .admin-settings__field-head--center {
    justify-content: flex-start;
  }

  .admin-settings__rows--sidebar {
    grid-column: 1;
    grid-row: auto;
  }
}

.admin-settings__theme-swatch {
  width: 32px;
  height: 24px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
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
