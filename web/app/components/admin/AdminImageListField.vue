<script setup lang="ts">
import { ref } from 'vue'
import type { UploadError } from '~/composables/useOssUpload'

/**
 * 后台「图片列表」字段控件。
 *
 * 需求：图片或多个图片都按照站点信息里 logo 图片的修改方式——
 * 显示图片，每个图片后显示选择文件。
 *
 * 为什么需要它：`site_settings.value_type='image'` 只关联一个 media_id，
 * 装不下多图（about_lecture_images 有 14 张）。这些多图字段在库里是
 * json 字符串数组，所以本控件直接编辑「URL 数组」：
 *   - 存储形态不变，不需要改表或迁移数据；
 *   - 逐张显示，每张后面跟「选择文件」，替换该位置的图片；
 *   - 选文件即上传 OSS 并写回，与 logo 的交互节奏一致；
 *   - 支持删除单张与追加一张。
 *
 * 与 SettingImageField 的区别：那个针对单图（写 media_id），
 * 这个针对 URL 数组（写 json 数组）。
 */
const props = withDefaults(defineProps<{
  /** 表单控件 id 前缀 */
  inputId: string
  /** 字段中文名，用于按钮与提示 */
  label: string
  /** 当前图片地址数组 */
  images: string[]
  /** 是否禁用（只读角色 / 保存中） */
  disabled?: boolean
  /** 上传使用的 OSS 用途范围 */
  usageScope?: 'logo' | 'background' | 'general' | 'qr' | 'about' | 'article'
}>(), {
  disabled: false,
  usageScope: 'general',
})

const emit = defineEmits<{
  /** 图片列表变化（父页面据此更新表单值） */
  'update:images': [value: string[]]
  /** 上传中状态变化（父页面据此禁用保存） */
  uploading: [value: boolean]
}>()

const { upload } = useOssUpload()

/** 每个槽位一个 input，用索引区分；追加槽位共用同一个 ref */
const slotInputs = ref<Record<number, HTMLInputElement | null>>({})
const appendInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref('')

function setSlotRef(index: number, element: unknown) {
  slotInputs.value[index] = element as HTMLInputElement | null
}

async function uploadFile(file: File): Promise<string> {
  const asset = await upload(file, { usageScope: props.usageScope })
  const url = String(asset?.publicUrl ?? '').trim()
  if (!url) throw new Error('上传成功但未返回可访问地址')
  return url
}

function toMessage(cause: unknown, fallback: string): string {
  const failure = cause as Partial<UploadError> & { message?: string }
  return failure?.message || fallback
}

/** 替换第 index 张图片。 */
async function onReplace(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  uploading.value = true
  emit('uploading', true)
  try {
    const url = await uploadFile(file)
    const next = [...props.images]
    next[index] = url
    emit('update:images', next)
  } catch (cause) {
    error.value = toMessage(cause, '图片上传失败，请稍后重试')
  } finally {
    uploading.value = false
    emit('uploading', false)
    input.value = ''
  }
}

/** 追加一张图片。 */
async function onAppend(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  uploading.value = true
  emit('uploading', true)
  try {
    const url = await uploadFile(file)
    emit('update:images', [...props.images, url])
  } catch (cause) {
    error.value = toMessage(cause, '图片上传失败，请稍后重试')
  } finally {
    uploading.value = false
    emit('uploading', false)
    input.value = ''
  }
}

function removeAt(index: number) {
  const next = props.images.filter((_, i) => i !== index)
  emit('update:images', next)
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= props.images.length) return
  const next = [...props.images]
  const [item] = next.splice(index, 1)
  // splice 在合法索引下必然取出一项；这里显式判空以同时满足类型收窄
  if (item === undefined) return
  next.splice(target, 0, item)
  emit('update:images', next)
}

function triggerReplace(index: number) {
  if (props.disabled || uploading.value) return
  slotInputs.value[index]?.click()
}

function triggerAppend() {
  if (props.disabled || uploading.value) return
  appendInput.value?.click()
}
</script>

<template>
  <div class="admin-image-list">
    <p class="admin-image-list__hint">
      共 {{ images.length }} 张。每张图片后可直接「选择文件」替换；也可删除、调整顺序或追加。
      选择文件后自动上传并保存。
    </p>

    <ul v-if="images.length > 0" class="admin-image-list__items">
      <li v-for="(url, index) in images" :key="`${index}-${url}`" class="admin-image-list__item">
        <img :src="url" :alt="`${label} 第 ${index + 1} 张`" loading="lazy">
        <div class="admin-image-list__actions">
          <input
            :id="`${inputId}-slot-${index}`"
            :ref="element => setSlotRef(index, element)"
            class="admin-image-list__file"
            type="file"
            accept="image/*"
            :disabled="disabled || uploading"
            @change="onReplace(index, $event)"
          >
          <button type="button" :disabled="disabled || uploading" @click="triggerReplace(index)">选择文件</button>
          <button type="button" :disabled="disabled || uploading || index === 0" @click="move(index, -1)">上移</button>
          <button type="button" :disabled="disabled || uploading || index === images.length - 1" @click="move(index, 1)">下移</button>
          <button type="button" class="admin-image-list__remove" :disabled="disabled || uploading" @click="removeAt(index)">删除</button>
        </div>
      </li>
    </ul>
    <p v-else class="admin-image-list__empty">尚未设置图片。</p>

    <input
      ref="appendInput"
      class="admin-image-list__file"
      type="file"
      accept="image/*"
      :disabled="disabled || uploading"
      @change="onAppend"
    >
    <button
      type="button"
      class="admin-image-list__append"
      :disabled="disabled || uploading"
      @click="triggerAppend"
    >
      {{ uploading ? '上传中…' : '＋ 追加一张图片' }}
    </button>

    <p v-if="error" class="admin-image-list__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.admin-image-list { display:flex; flex-direction:column; gap:var(--space-3); }
.admin-image-list__hint { font-size:var(--text-xs); color:var(--color-text-muted); }
.admin-image-list__items { display:flex; flex-direction:column; gap:var(--space-3); list-style:none; padding:0; margin:0; }
.admin-image-list__item { display:grid; grid-template-columns:160px minmax(0,1fr); gap:var(--space-3); align-items:start; padding:var(--space-3); border:1px solid var(--color-border); border-radius:var(--radius-md); background-color:var(--color-bg-light); }
.admin-image-list__item img { display:block; width:160px; height:auto; max-height:120px; object-fit:contain; border-radius:var(--radius-sm); background-color:var(--color-bg-page); }
.admin-image-list__actions { display:flex; align-items:center; gap:var(--space-2); flex-wrap:wrap; }
.admin-image-list__actions button { padding:3px 10px; border:1px solid var(--color-border-strong); border-radius:var(--radius-sm); background-color:var(--color-bg-page); font-size:var(--text-sm); cursor:pointer; }
.admin-image-list__actions button:hover:not(:disabled) { border-color:var(--color-primary); color:var(--color-primary); }
.admin-image-list__actions button:disabled { cursor:not-allowed; opacity:.5; }
.admin-image-list__remove:hover:not(:disabled) { border-color:var(--color-primary); color:var(--color-primary); }
.admin-image-list__file { display:none; }
.admin-image-list__empty { font-size:var(--text-sm); color:var(--color-text-muted); }
.admin-image-list__append { align-self:flex-start; padding:var(--space-2) var(--space-4); border:1px dashed var(--color-border-strong); border-radius:var(--radius-md); background-color:transparent; font-size:var(--text-sm); cursor:pointer; }
.admin-image-list__append:hover:not(:disabled) { border-color:var(--color-primary); color:var(--color-primary); }
.admin-image-list__append:disabled { cursor:not-allowed; opacity:.5; }
.admin-image-list__error { font-size:var(--text-xs); color:var(--color-primary); }
@media (max-width: 767px) {
  .admin-image-list__item { grid-template-columns:1fr; }
}
</style>
