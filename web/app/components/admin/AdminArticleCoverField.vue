<script setup lang="ts">
import { ref } from 'vue'
import type { UploadError } from '~/composables/useOssUpload'

const props = withDefaults(defineProps<{
  modelValue: number | null
  mediaUrl: string
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  uploaded: [payload: { mediaId: number, mediaUrl: string }]
  cleared: []
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
    const media = await upload(file, { usageScope: 'article', title: '文章封面' })
    const mediaId = Number(media.id)
    const mediaUrl = String(media.publicUrl ?? '').trim()
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || !mediaUrl) {
      throw new Error('上传完成，但没有取得有效的媒体记录。')
    }
    emit('update:modelValue', mediaId)
    emit('uploaded', { mediaId, mediaUrl })
  } catch (cause) {
    const failure = cause as Partial<UploadError> & { message?: string }
    errorMessage.value = failure?.message || '封面上传失败，请稍后重试。'
  } finally {
    emit('uploading', false)
  }
}

function clearCover() {
  emit('update:modelValue', null)
  emit('cleared')
  errorMessage.value = ''
}
</script>

<template>
  <div class="article-cover-field">
    <div class="article-cover-field__preview">
      <img v-if="mediaUrl" :src="mediaUrl" alt="文章封面预览">
      <span v-else>未设置封面</span>
    </div>
    <div class="article-cover-field__controls">
      <input
        ref="fileInput"
        class="article-cover-field__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        :disabled="disabled || uploading"
        @change="onFileChange"
      >
      <div class="article-cover-field__actions">
        <BaseButton type="button" variant="secondary" size="sm" :disabled="disabled || uploading" @click="fileInput?.click()">
          {{ uploading ? `上传中 ${progress}%` : mediaUrl ? '更换封面' : '上传封面' }}
        </BaseButton>
        <BaseButton v-if="modelValue !== null" type="button" variant="ghost" size="sm" :disabled="disabled || uploading" @click="clearCover">
          清除封面
        </BaseButton>
      </div>
      <p class="article-cover-field__hint">支持 JPG / PNG / WebP / GIF，单张不超过 20 MB。</p>
      <p v-if="errorMessage" class="article-cover-field__error" role="alert">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.article-cover-field { display:flex; align-items:flex-start; gap:var(--space-4); flex-wrap:wrap; }
.article-cover-field__preview { display:grid; place-items:center; width:180px; height:120px; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg-light); color:var(--color-text-muted); font-size:var(--text-sm); }
.article-cover-field__preview img { width:100%; height:100%; object-fit:contain; }
.article-cover-field__controls { display:flex; min-width:240px; flex:1; flex-direction:column; align-items:flex-start; gap:var(--space-2); }
.article-cover-field__input { display:none; }
.article-cover-field__actions { display:flex; flex-wrap:wrap; gap:var(--space-2); }
.article-cover-field__hint { color:var(--color-text-muted); font-size:var(--text-xs); }
.article-cover-field__error { color:var(--color-primary); font-size:var(--text-sm); }
</style>
