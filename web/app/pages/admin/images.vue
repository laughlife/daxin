<script setup lang="ts">
import { computed, ref } from 'vue'
import { adminRequestErrorMessage } from '~/utils/adminApi'

/**
 * 图片管理（/admin/images）。
 *
 * 按需求只显示数据库里配置的团队介绍右侧图片、业务板块图片、关于我们简介左侧图片，
 * 这些配置可编辑上传新的图片来替换。
 *
 * 实现要点：
 *   - 只呈现这 3 条配置，不列出其它配置项；
 *   - 每条都按「显示当前图片 + 选择文件」的方式（复用 SettingImageField，
 *     与站点信息里的 logo 完全同一套交互）；
 *   - 选中文件后立即走「申请凭证 → 直传 OSS → 登记媒体 → 写配置」，
 *     因此不需要再点保存；
 *   - 后两条在库里是 json 数组（about_hero_image / about_business_images），
 *     上传后替换数组首项；多图编辑仍由「关于我们」配置页负责。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '图片管理',
  description: '维护团队介绍右侧、业务板块与关于我们简介左侧图片。',
  robots: 'noindex, nofollow'
})

interface SettingItem {
  key: string
  label: string
  value: unknown
  valueType: string
  mediaId: number | null
  mediaUrl: string
}

/** 后台 settings 接口返回的原始 item（字段名与接口一致）。 */
interface RawSettingItem {
  key?: unknown
  label?: unknown
  value?: unknown
  valueType?: unknown
  mediaId?: unknown
  mediaUrl?: unknown
}

/**
 * 图片管理只关心这 3 条。
 * `json` 类型说明该配置在库里是数组，取数组首项作为当前图片。
 */
const MANAGED_IMAGES = [
  { key: 'home_right_image', label: '团队介绍右侧图片', kind: 'home', json: false },
  { key: 'about_hero_image', label: '关于我们简介左侧图片', kind: 'about', json: true },
  { key: 'about_business_images', label: '业务板块图片', kind: 'about', json: true },
] as const

/**
 * 后台接口取数必须用 useRequestFetch：它在 SSR 时会转发当前请求的 Cookie，
 * 普通 $fetch 不带 Cookie，服务端渲染阶段会拿到 401 并显示「加载失败」。
 */
const requestFetch = useRequestFetch()

const loading = ref(true)
const loadError = ref('')
const saveError = ref('')
const saveOk = ref('')
const uploadingKey = ref('')
/** key → 当前展示地址 */
const previews = ref<Record<string, string>>({})
/** key → 该配置所属 kind（保存时要用） */
const kinds = ref<Record<string, string>>({})
/** 各 kind 的完整 items，保存时整组回传，避免只写一条把同组其它键丢掉 */
const itemsByKind = ref<Record<string, RawSettingItem[]>>({})

const rows = computed(() =>
  MANAGED_IMAGES.map((meta) => ({
    ...meta,
    preview: previews.value[meta.key] ?? '',
  }))
)

/** 把接口返回的 value（可能是数组）归一化成首项地址。 */
function firstImageUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const url = record.url ?? record.mediaUrl ?? record.imageUrl
        if (typeof url === 'string' && url.trim()) return url.trim()
      }
    }
  }
  return ''
}

async function loadSettings() {
  loading.value = true
  loadError.value = ''
  try {
    const nextPreviews: Record<string, string> = {}
    const nextKinds: Record<string, string> = {}
    const nextItems: Record<string, RawSettingItem[]> = {}

    for (const kind of ['home', 'about'] as const) {
      const response = await requestFetch<{ data?: { items?: RawSettingItem[] } }>(
        `/api/admin/settings?kind=${kind}`
      )
      const items = Array.isArray(response?.data?.items) ? response.data.items : []
      nextItems[kind] = items
      for (const meta of MANAGED_IMAGES.filter((entry) => entry.kind === kind)) {
        const item = items.find((entry) => String(entry.key ?? '') === meta.key)
        nextKinds[meta.key] = kind
        // image 类型用联表返回的 mediaUrl；json 数组从 value 里取首项
        const url = String(item?.mediaUrl ?? '').trim()
          || (meta.json ? firstImageUrl(item?.value) : '')
        nextPreviews[meta.key] = url
      }
    }

    previews.value = nextPreviews
    kinds.value = nextKinds
    itemsByKind.value = nextItems
  } catch (error) {
    loadError.value = adminRequestErrorMessage(error, '图片配置加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

await loadSettings()

/** 把某个 kind 的整组 items 发回服务端（只改目标键）。 */
async function persistMedia(kind: string, key: string, meta: { json: boolean }, mediaId: number) {
  const items = itemsByKind.value[kind] ?? []
  const next = items.map((item) => {
    if (String(item.key ?? '') !== key) return item
    // json 类型：替换数组首项；image 类型：直接写 mediaId
    if (!meta.json) return { ...item, mediaId }
    const current = Array.isArray(item.value) ? item.value : []
    const rest = current.slice(1)
    return { ...item, mediaId, value: ['', ...rest] }
  })
  // 目标键不存在时补一条，避免静默什么都没改
  if (!items.some((item) => String(item.key ?? '') === key)) {
    next.push({ key, mediaId, value: meta.json ? [''] : '', valueType: meta.json ? 'json' : 'image' })
  }
  await requestFetch('/api/admin/settings', { method: 'PUT', body: { kind, items: next } })
}

function onUploading(key: string, value: boolean) {
  uploadingKey.value = value ? key : ''
}

async function onUploaded(key: string, payload: { mediaId: number, mediaUrl: string }) {
  const meta = MANAGED_IMAGES.find((entry) => entry.key === key)
  if (!meta) return
  saveError.value = ''
  saveOk.value = ''
  try {
    await persistMedia(meta.kind, meta.key, meta, payload.mediaId)
    // 写回后重新拉取，确保展示的是服务端真实状态而不是本地猜测
    await loadSettings()
    saveOk.value = `${meta.label} 已更新`
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, `${meta.label} 保存失败，请稍后重试`)
  }
}
</script>

<template>
  <section class="admin-images">
    <header class="admin-images__head">
      <h1>图片管理</h1>
      <p>维护首页与关于我们的指定配图。选择文件后自动上传到 OSS 并保存，无需再点保存。</p>
    </header>

    <p v-if="loading" class="admin-images__status">正在加载图片配置…</p>
    <ErrorState
      v-else-if="loadError"
      title="图片配置加载失败"
      :message="loadError"
      @retry="loadSettings"
    />
    <template v-else>
      <p v-if="saveOk" class="admin-images__ok" role="status">{{ saveOk }}</p>
      <p v-if="saveError" class="admin-images__error" role="alert">{{ saveError }}</p>

      <ul class="admin-images__list">
        <li v-for="row in rows" :key="row.key" class="admin-images__row">
          <div class="admin-images__info">
            <h2>{{ row.label }}</h2>
            <code>{{ row.key }}</code>
          </div>
          <SettingImageField
            :input-id="`admin-image-${row.key}`"
            :label="row.label"
            :media-url="row.preview"
            :disabled="Boolean(uploadingKey) && uploadingKey !== row.key"
            usage-scope="general"
            @uploading="onUploading(row.key, $event)"
            @uploaded="onUploaded(row.key, $event)"
          />
        </li>
      </ul>

      <p class="admin-images__hint">
        「关于我们简介左侧图片」与「业务板块图片」在数据库中保存为图片数组，
        此处替换的是首张图；需要增删多张时请到「站点设置 → 关于我们」中维护。
      </p>
    </template>
  </section>
</template>

<style scoped>
.admin-images { display:flex; flex-direction:column; gap:var(--space-6); }
.admin-images__head h1 { font-size:var(--text-2xl); }
.admin-images__head p { margin-top:var(--space-2); color:var(--color-text-muted); font-size:var(--text-sm); }
.admin-images__status { color:var(--color-text-muted); }
.admin-images__ok { padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); background-color:color-mix(in srgb, var(--color-success, #16a34a) 12%, transparent); color:var(--color-text); font-size:var(--text-sm); }
.admin-images__error { padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); background-color:var(--color-primary-light); color:var(--color-primary); font-size:var(--text-sm); }
.admin-images__list { display:flex; flex-direction:column; gap:var(--space-4); list-style:none; padding:0; margin:0; }
.admin-images__row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:var(--space-6); align-items:start; padding:var(--space-5); background-color:var(--color-bg-page); border:1px solid var(--color-border); border-radius:var(--radius-lg); }
.admin-images__info h2 { font-size:var(--text-base); }
.admin-images__info code { display:inline-block; margin-top:var(--space-1); font-size:var(--text-xs); color:var(--color-text-muted); }
.admin-images__hint { font-size:var(--text-xs); color:var(--color-text-muted); }
@media (max-width: 767px) {
  .admin-images__row { grid-template-columns:1fr; }
}
</style>
