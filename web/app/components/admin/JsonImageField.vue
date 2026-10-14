<script setup lang="ts">
import { ref } from 'vue'
import type { UploadError } from '~/composables/useOssUpload'

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  uploading: [value: boolean]
}>()

const { upload, uploading, progress } = useOssUpload()
const fileInput = ref<HTMLInputElement | null>(null)
const errorMessage = ref('')

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.disabled || uploading.value) return

  errorMessage.value = ''
  emit('uploading', true)
  try {
    const media = await upload(file, { usageScope: 'general', title: props.label })
    const publicUrl = String(media.publicUrl ?? '').trim()
    if (!publicUrl) throw new Error('上传完成，但没有取得图片访问地址。')
    emit('update:modelValue', publicUrl)
  } catch (cause) {
    const failure = cause as Partial<UploadError> & { message?: string }
    errorMessage.value = failure?.message || '图片上传失败，请稍后重试。'
  } finally {
    emit('uploading', false)
  }
}
</script>

<template>
  <div class="json-image-field">
    <img v-if="modelValue" class="json-image-field__preview" :src="modelValue" :alt="label">
    <div v-else class="json-image-field__empty">未设置图片</div>
    <div class="json-image-field__controls">
      <input
        ref="fileInput"
        class="json-image-field__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        :disabled="disabled || uploading"
        @change="onFileChange"
      >
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        :disabled="disabled || uploading"
        @click="fileInput?.click()"
      >
        {{ uploading ? `上传中 ${progress}%` : modelValue ? '更换图片' : '上传图片' }}
      </BaseButton>
      <p class="json-image-field__hint">支持 JPG / PNG / WebP / GIF，单张不超过 20 MB；上传完成后仍需保存本组配置。</p>
      <p v-if="errorMessage" class="json-image-field__error" role="alert">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.json-image-field { display:flex; align-items:flex-start; gap:var(--space-4); flex-wrap:wrap; }
.json-image-field__preview, .json-image-field__empty { width:160px; height:120px; object-fit:contain; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-light); }
.json-image-field__empty { display:grid; place-items:center; color:var(--color-text-muted); font-size:var(--text-sm); }
.json-image-field__controls { display:flex; min-width:240px; flex:1; flex-direction:column; align-items:flex-start; gap:var(--space-2); }
.json-image-field__input { display:none; }
.json-image-field__hint { color:var(--color-text-muted); font-size:var(--text-xs); }
.json-image-field__error { color:var(--color-primary); font-size:var(--text-sm); }
</style>
