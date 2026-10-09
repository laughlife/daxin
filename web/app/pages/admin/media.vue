<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MediaAsset, UploadError } from '~/composables/useOssUpload'

/**
 * 媒体库（上传）。
 *
 * 后端不接收文件本体：浏览器先向 /api/admin/upload-policy 申请一次性凭证，
 * 再直传阿里云 OSS，最后调用 /api/admin/media 登记记录。
 * 因此本页只负责表单、进度与结果展示。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '媒体库',
  description: '后台媒体资源上传。',
  robots: 'noindex, nofollow'
})

/** 用途选项，与后端 UPLOAD_SCOPES 保持一致 */
const USAGE_SCOPES: { value: string, label: string }[] = [
  { value: 'logo', label: '站点 Logo' },
  { value: 'background', label: '页面背景' },
  { value: 'banner', label: '横幅广告' },
  { value: 'article', label: '文章配图（允许 PDF）' },
  { value: 'about', label: '关于我们' },
  { value: 'qr', label: '二维码' },
  { value: 'general', label: '通用' }
]

/**
 * 上一次上传策略下发的白名单 MIME。
 * 首次打开页面时只能给出静态提示，上传过一次后即可用服务端真实白名单
 * 收紧文件选择器；真正的校验始终在服务端。
 */
const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

const { upload, uploading, progress, error } = useOssUpload()

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const usageScope = ref('general')
const title = ref('')
const result = ref<MediaAsset | null>(null)
const errorMessage = ref('')
/** 服务端上一次下发的允许上传类型（未上传过时为空） */
const allowedMimeTypes = ref<string[]>([])

/** 文件选择器的 accept：优先使用服务端白名单 */
const accept = computed(() =>
  allowedMimeTypes.value.length ? allowedMimeTypes.value.join(',') : DEFAULT_ACCEPT
)

/** 结果面板展示的地址：publicUrl 缺失时退回 objectKey */
const resultLocation = computed(() => result.value?.publicUrl || result.value?.objectKey || '')

/** 结果面板展示的文件大小 */
const resultSize = computed(() => (result.value ? formatBytes(result.value.byteSize) : ''))

const canSubmit = computed(() => Boolean(file.value) && !uploading.value)

/** 选择文件：清空上一次的结果与错误，避免新旧信息混在一起 */
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  result.value = null
  errorMessage.value = ''
}

/** 提交上传 */
async function onSubmit() {
  if (!file.value || uploading.value) return
  errorMessage.value = ''
  result.value = null
  try {
    result.value = await upload(file.value, {
      usageScope: usageScope.value,
      ...(title.value.trim() ? { title: title.value.trim() } : {}),
      // 用服务端真实白名单收紧下一次的文件选择器
      onPolicy: (policy) => {
        allowedMimeTypes.value = Array.isArray(policy.allowedMimeTypes)
          ? policy.allowedMimeTypes
          : []
      }
    })
  } catch (cause) {
    const failure = cause as UploadError
    errorMessage.value = failure?.message || '上传失败，请稍后重试'
  }
}

/** 重新选择文件并清空表单状态 */
function resetForm() {
  file.value = null
  title.value = ''
  result.value = null
  errorMessage.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
    fileInput.value.focus()
  }
}
</script>

<template>
  <PageContainer class="admin-media" size="wide">
    <header class="admin-media__head">
      <h1 class="admin-media__title">媒体库</h1>
      <p class="admin-media__desc">
        上传图片与 PDF 附件。文件由浏览器直传对象存储，服务器只负责签名与登记记录。
      </p>
    </header>

    <BaseCard class="admin-media__card" title="上传媒体" :title-level="2">
      <form class="admin-media__form" novalidate @submit.prevent="onSubmit">
        <div class="admin-media__field">
          <label class="admin-media__label" for="media-file">选择文件（必填）</label>
          <input
            id="media-file"
            ref="fileInput"
            class="admin-media__input"
            type="file"
            name="file"
            :accept="accept"
            :disabled="uploading"
            required
            aria-describedby="media-file-hint"
            @change="onFileChange"
          >
          <p id="media-file-hint" class="admin-media__hint">
            支持 JPG / PNG / WebP / GIF 图片；用途选择“文章配图”时额外支持 PDF。
            不允许 SVG（存在脚本注入风险），大小上限以服务端配置为准。
          </p>
        </div>

        <div class="admin-media__field">
          <label class="admin-media__label" for="media-usage">用途</label>
          <select
            id="media-usage"
            v-model="usageScope"
            class="admin-media__select"
            name="usageScope"
            :disabled="uploading"
          >
            <option v-for="item in USAGE_SCOPES" :key="item.value" :value="item.value">
              {{ item.label }}（{{ item.value }}）
            </option>
          </select>
        </div>

        <div class="admin-media__field">
          <label class="admin-media__label" for="media-title">标题（可选）</label>
          <input
            id="media-title"
            v-model="title"
            class="admin-media__input"
            type="text"
            name="title"
            maxlength="120"
            :disabled="uploading"
            placeholder="例如：首页品牌 Logo"
          >
        </div>

        <div class="admin-media__actions">
          <BaseButton type="submit" :disabled="!canSubmit">
            {{ uploading ? '上传中…' : '开始上传' }}
          </BaseButton>
          <BaseButton variant="secondary" :disabled="uploading" @click="resetForm">
            重置
          </BaseButton>
        </div>
      </form>

      <div v-if="uploading || progress > 0" class="admin-media__progress">
        <p id="media-progress-label" class="admin-media__progress-text">
          上传进度：{{ progress }}%
        </p>
        <div
          class="admin-media__progress-track"
          role="progressbar"
          aria-labelledby="media-progress-label"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progress"
        >
          <div class="admin-media__progress-bar" :style="{ width: `${progress}%` }" />
        </div>
      </div>

      <p v-if="errorMessage" class="admin-media__error" role="alert">{{ errorMessage }}</p>
    </BaseCard>

    <BaseCard v-if="result" class="admin-media__card admin-media__card--success" title="上传成功" :title-level="2">
      <dl class="admin-media__result">
        <div class="admin-media__result-row">
          <dt>访问地址</dt>
          <dd>
            <a :href="resultLocation" target="_blank" rel="noopener noreferrer">{{ resultLocation }}</a>
            <span v-if="!result.publicUrl" class="admin-media__result-note">
              （服务端未返回公开地址，此处为对象 Key）
            </span>
          </dd>
        </div>
        <div class="admin-media__result-row">
          <dt>媒体 ID</dt>
          <dd>{{ result.id }}</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>文件大小</dt>
          <dd>{{ resultSize }}（{{ result.byteSize }} 字节）</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>MIME 类型</dt>
          <dd>{{ result.mimeType }}</dd>
        </div>
        <div class="admin-media__result-row">
          <dt>用途</dt>
          <dd>{{ result.usageScope }}</dd>
        </div>
      </dl>
    </BaseCard>

    <BaseCard class="admin-media__card" title="媒体列表" :title-level="2">
      <p>
        媒体列表（浏览、检索、替换与删除）将随内容管理任务一并上线，当前版本仅提供上传入口。
      </p>
      <p class="admin-media__back">
        <NuxtLink to="/admin">返回后台首页</NuxtLink>
      </p>
    </BaseCard>
  </PageContainer>
</template>

<style scoped>
.admin-media {
  padding-block: var(--space-8) var(--space-16);
}

.admin-media__head {
  margin-bottom: var(--space-6);
}

.admin-media__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-media__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__card {
  margin-top: var(--space-6);
}

.admin-media__card--success {
  border-color: var(--color-success);
}

.admin-media__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-media__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-media__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-media__input,
.admin-media__select {
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-media__select {
  max-width: 320px;
}

.admin-media__input:disabled,
.admin-media__select:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-media__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-media__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.admin-media__progress {
  margin-top: var(--space-5);
}

.admin-media__progress-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-media__progress-track {
  margin-top: var(--space-2);
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-light);
  border: 1px solid var(--color-border);
}

.admin-media__progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  transition: width var(--transition-base);
}

.admin-media__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-media__result {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-media__result-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.admin-media__result-row dt {
  min-width: 6em;
  color: var(--color-text-muted);
}

.admin-media__result-row dd {
  margin: 0;
  color: var(--color-text);
  word-break: break-all;
}

.admin-media__result-note {
  color: var(--color-warning);
}

.admin-media__back {
  margin-top: var(--space-4);
  font-size: var(--text-sm);
}
</style>
