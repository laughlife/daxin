<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UploadError } from '~/composables/useOssUpload'

/**
 * 站点配置中的图片字段上传控件。
 *
 * 配置项本身只存 `media_id`，展示用的 `mediaUrl` 由接口联表返回。
 * 因此上传分两步：
 *   1. 用 useOssUpload() 走「申请凭证 → 直传 OSS → 登记媒体记录」，拿到 mediaId；
 *   2. 把 mediaId 交给父页面，由父页面通过 PUT /api/admin/settings 持久化
 *      （服务端 `normalizeSettingItems` 接受 item.mediaId 并写入 site_settings.media_id，
 *       同时把 media_id 关联到媒体表，GET 时联表得到 mediaUrl）。
 * 这里只负责第 1 步与状态展示，不自行调用配置保存接口，避免出现「图片传了但配置没存」。
 */
const props = withDefaults(
  defineProps<{
    /** 表单控件 id（供 label 的 for 使用） */
    inputId: string
    /** 字段中文名，用于按钮与提示文案 */
    label: string
    /** 已关联的展示地址，空串表示未设置 */
    mediaUrl: string
    /** 是否禁用（只读角色 / 保存中 / 上传中） */
    disabled?: boolean
    /** 上传使用的 OSS 用途范围 */
    usageScope?: 'logo' | 'background' | 'general' | 'qr' | 'about'
    /** 特定图片使用更宽的预览框，例如首屏标题效果图。 */
    previewSize?: 'default' | 'wide'
  }>(),
  {
    disabled: false,
    usageScope: 'general',
    previewSize: 'default'
  }
)

const emit = defineEmits<{
  /** 上传并登记成功（父页面据此持有待保存的 mediaId 与预览地址） */
  uploaded: [payload: { mediaId: number, mediaUrl: string }]
  /** 上传中状态变化（父页面据此禁用保存按钮） */
  uploading: [value: boolean]
}>()

const { upload } = useOssUpload()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const errorMessage = ref('')
const progress = ref(0)
/** 本地刚上传成功的地址，优先于接口返回的 mediaUrl 展示 */
const localUrl = ref('')

const previewUrl = computed(() => localUrl.value || props.mediaUrl)
const accept = 'image/jpeg,image/png,image/webp,image/gif'
const buttonLabel = computed(() => {
  if (uploading.value) return `上传中… ${progress.value}%`
  return previewUrl.value ? '更换图片' : '上传图片'
})

/** 选择文件后立即上传并登记媒体记录 */
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // 允许重复选择同一个文件：先清空 input 的值
  input.value = ''
  if (!file || uploading.value) return

  errorMessage.value = ''
  uploading.value = true
  emit('uploading', true)
  progress.value = 0
  try {
    const media = await upload(file, {
      usageScope: props.usageScope,
      title: props.label,
      onPolicy: () => {
        progress.value = 0
      }
    })
    localUrl.value = media.publicUrl || ''
    emit('uploaded', { mediaId: media.id, mediaUrl: media.publicUrl || '' })
  } catch (cause) {
    const failure = cause as UploadError
    errorMessage.value = failure?.message || '上传失败，请稍后重试'
  } finally {
    uploading.value = false
    emit('uploading', false)
  }
}
</script>

<template>
  <div class="setting-image" :class="{ 'setting-image--wide': previewSize === 'wide' }">
    <div class="setting-image__preview">
      <img v-if="previewUrl" :src="previewUrl" :alt="`${label}预览`" class="setting-image__img">
      <p v-else class="setting-image__empty">未设置</p>
    </div>

    <div class="setting-image__side">
      <input
        :id="inputId"
        ref="fileInput"
        class="setting-image__file"
        type="file"
        :accept="accept"
        :disabled="disabled || uploading"
        @change="onFileChange"
      >
      <label :for="inputId" class="setting-image__label">选择图片文件</label>
      <p class="setting-image__hint">
        <span v-if="uploading">{{ buttonLabel }}</span>
        <template v-else>
          支持 JPG / PNG / WebP / GIF；上传成功后需点击「保存」才会写入配置。
        </template>
      </p>
    </div>

    <p v-if="errorMessage" class="setting-image__error" role="alert">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.setting-image {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
}

.setting-image__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 80px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
}

.setting-image--wide .setting-image__preview {
  width: min(380px, 100%);
  height: 100px;
}

.setting-image__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.setting-image__empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.setting-image__side {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 240px;
}

.setting-image__file {
  font-size: var(--text-sm);
}

.setting-image__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.setting-image__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.setting-image__error {
  flex-basis: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: var(--text-sm);
}
</style>
