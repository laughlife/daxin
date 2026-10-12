<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

/**
 * 后台富文本编辑器。
 *
 * 需求：文章正文支持「排版字体以及图片」，保存时图片上传 OSS，
 * 文章里的图片直接存 OSS 访问路径，整个文章入库。
 *
 * 实现取舍：
 *   - 不引入第三方编辑器依赖（项目此前也没有），用原生 contenteditable + 工具栏；
 *   - 格式化用 document.execCommand：它已被标记为废弃，但在 Chrome/Edge/Firefox/Safari
 *     仍然可用，且无需引入库；此处只用于后台管理，可接受。
 *     若将来 execCommand 被移除，替换工具栏实现即可，v-model 契约不变；
 *   - 图片走既有 useOssUpload（申请凭证 → 直传 OSS → 登记媒体），
 *     拿到 publicUrl 后以 <img src="OSS 地址"> 插入正文，
 *     因此正文 HTML 里存的就是可直接访问的 OSS 路径；
 *   - v-model 的值为 HTML 字符串，父页面原样写入 articles.content_html。
 */
const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: '在这里编写正文…',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const uploadOk = ref('')

const { upload } = useOssUpload()

/** 把编辑器当前 HTML 回传给父组件。 */
function emitChange() {
  const html = editor.value?.innerHTML ?? ''
  emit('update:modelValue', html)
}

/**
 * 同步外部值到编辑器。
 * 只在内容确有差异时写入，否则每次输入都会重置 DOM 而丢失光标位置。
 */
function syncFromProp(value: string) {
  const element = editor.value
  if (!element) return
  if (element.innerHTML !== (value ?? '')) element.innerHTML = value ?? ''
}

onMounted(() => syncFromProp(props.modelValue))
watch(() => props.modelValue, (value) => syncFromProp(value))

/** 工具栏按钮统一入口：保持选区后再执行命令。 */
function run(command: string, value?: string) {
  if (props.disabled) return
  editor.value?.focus()
  document.execCommand(command, false, value)
  emitChange()
}

/** 用 prompt 取链接与标题文本，避免为两个小功能引入弹窗组件。 */
function insertLink() {
  if (props.disabled) return
  const url = window.prompt('请输入链接地址（含 https://）')
  if (!url) return
  run('createLink', url)
}

function formatBlock(tag: string) {
  run('formatBlock', tag)
}

/** 选择图片 → 上传 OSS → 以 OSS 地址插入正文。 */
async function onPickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = ''
  uploadOk.value = ''
  uploading.value = true
  try {
    const asset = await upload(file, { usageScope: 'article' })
    const url = asset?.publicUrl ?? ''
    if (!url) throw new Error('上传成功但未返回可访问地址')
    editor.value?.focus()
    document.execCommand('insertHTML', false, `<img src="${url}" alt="">`)
    emitChange()
    uploadOk.value = '图片已上传并插入正文'
  } catch (error) {
    const failure = error as { message?: string }
    uploadError.value = failure?.message || '图片上传失败，请稍后重试'
  } finally {
    uploading.value = false
    // 允许重复选择同一个文件
    input.value = ''
  }
}

function triggerPick() {
  if (props.disabled) return
  fileInput.value?.click()
}
</script>

<template>
  <div class="admin-rte" :class="{ 'admin-rte--disabled': disabled }">
    <div class="admin-rte__toolbar" role="toolbar" aria-label="正文格式工具栏">
      <button type="button" :disabled="disabled" title="加粗" @click="run('bold')"><strong>B</strong></button>
      <button type="button" :disabled="disabled" title="斜体" @click="run('italic')"><em>I</em></button>
      <button type="button" :disabled="disabled" title="下划线" @click="run('underline')"><u>U</u></button>
      <span class="admin-rte__sep" aria-hidden="true" />
      <button type="button" :disabled="disabled" title="标题" @click="formatBlock('h2')">标题</button>
      <button type="button" :disabled="disabled" title="小标题" @click="formatBlock('h3')">小标题</button>
      <button type="button" :disabled="disabled" title="正文" @click="formatBlock('p')">正文</button>
      <span class="admin-rte__sep" aria-hidden="true" />
      <button type="button" :disabled="disabled" title="无序列表" @click="run('insertUnorderedList')">• 列表</button>
      <button type="button" :disabled="disabled" title="有序列表" @click="run('insertOrderedList')">1. 列表</button>
      <button type="button" :disabled="disabled" title="引用" @click="formatBlock('blockquote')">引用</button>
      <span class="admin-rte__sep" aria-hidden="true" />
      <button type="button" :disabled="disabled" title="插入链接" @click="insertLink">链接</button>
      <button type="button" :disabled="disabled" title="插入图片" @click="triggerPick">
        {{ uploading ? '上传中…' : '插入图片' }}
      </button>
      <span class="admin-rte__sep" aria-hidden="true" />
      <button type="button" :disabled="disabled" title="清除格式" @click="run('removeFormat')">清除格式</button>
      <span class="admin-rte__sep" aria-hidden="true" />
      <label class="admin-rte__font" title="字号">
        字号
        <select :disabled="disabled" @change="run('fontSize', ($event.target as HTMLSelectElement).value)">
          <option value="3">默认</option>
          <option value="4">大</option>
          <option value="5">较大</option>
          <option value="6">特大</option>
          <option value="2">小</option>
        </select>
      </label>
    </div>

    <div
      ref="editor"
      class="admin-rte__body"
      :contenteditable="!disabled"
      role="textbox"
      aria-multiline="true"
      :data-placeholder="placeholder"
      @input="emitChange"
      @blur="emitChange"
    />

    <input
      ref="fileInput"
      class="admin-rte__file"
      type="file"
      accept="image/*"
      @change="onPickFile"
    >

    <p v-if="uploadOk" class="admin-rte__ok" role="status">{{ uploadOk }}</p>
    <p v-if="uploadError" class="admin-rte__error" role="alert">{{ uploadError }}</p>
  </div>
</template>

<style scoped>
.admin-rte { border:1px solid var(--color-border-strong); border-radius:var(--radius-md); background-color:var(--color-bg-page); }
.admin-rte--disabled { opacity:.7; }
.admin-rte__toolbar { display:flex; align-items:center; gap:var(--space-1); flex-wrap:wrap; padding:var(--space-2); border-bottom:1px solid var(--color-border); background-color:var(--color-bg-light); }
.admin-rte__toolbar button { padding:4px 10px; border:1px solid var(--color-border); border-radius:var(--radius-sm); background-color:var(--color-bg-page); font-size:var(--text-sm); cursor:pointer; }
.admin-rte__toolbar button:hover:not(:disabled) { border-color:var(--color-primary); color:var(--color-primary); }
.admin-rte__toolbar button:disabled { cursor:not-allowed; opacity:.5; }
.admin-rte__sep { width:1px; height:18px; background-color:var(--color-border); margin-inline:var(--space-1); }
.admin-rte__font { display:inline-flex; align-items:center; gap:6px; font-size:var(--text-sm); }
.admin-rte__font select { padding:2px 6px; border:1px solid var(--color-border); border-radius:var(--radius-sm); font:inherit; font-size:var(--text-sm); }
.admin-rte__body { min-height:280px; max-height:640px; overflow:auto; padding:var(--space-4); font-size:var(--text-base); line-height:var(--leading-relaxed); outline:none; }
.admin-rte__body:empty::before { content:attr(data-placeholder); color:var(--color-text-muted); }
.admin-rte__body :deep(img) { max-width:100%; height:auto; border-radius:var(--radius-md); }
.admin-rte__body :deep(h2) { font-size:var(--text-xl); margin-block:var(--space-3); }
.admin-rte__body :deep(h3) { font-size:var(--text-lg); margin-block:var(--space-2); }
.admin-rte__body :deep(blockquote) { margin-block:var(--space-3); padding-left:var(--space-4); border-left:3px solid var(--color-primary); color:var(--color-text-muted); }
.admin-rte__body :deep(ul), .admin-rte__body :deep(ol) { padding-left:1.4em; margin-block:var(--space-2); }
.admin-rte__file { display:none; }
.admin-rte__ok { padding:var(--space-2) var(--space-4); font-size:var(--text-xs); color:var(--color-text-muted); }
.admin-rte__error { padding:var(--space-2) var(--space-4); font-size:var(--text-xs); color:var(--color-primary); }
</style>
