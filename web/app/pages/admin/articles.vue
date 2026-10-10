<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { AdminArticleDetail, AdminArticleItem } from '~/types/adminContent'
import {
  ADMIN_PAGE_SIZE,
  adminRequestErrorMessage,
  requestAdminApi,
  toAdminQuery,
  toDateTimeLocal,
  toPageMeta,
  type AdminPageMeta,
  type AdminWriteResult,
} from '~/utils/adminApi'
import { canWriteContent, READ_ONLY_NOTICE } from '~/utils/adminPermission'

/**
 * 文章管理（/admin/articles）。
 *
 * 数据全部来自 /api/admin/articles（列表）与 /api/admin/articles/[id]（详情，含**未清洗**的
 * contentHtml）。页面不做任何本地 mock：加载失败展示 ErrorState + 重试，空结果显示中文空状态。
 * 权限：admin / editor 可写，viewer 只读——只读时所有写控件禁用并给出中文说明。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '文章管理',
  description: '后台文章列表与编辑。',
  robots: 'noindex, nofollow'
})

const { user, load } = useAdminSession()
// 后台首屏（含 SSR）就需要角色信息，才能正确禁用只读角色的写控件。
await load()

const canWrite = computed(() => canWriteContent(user.value))
const readOnlyReason = READ_ONLY_NOTICE

const ARTICLE_STATUSES = [
  { value: 'draft', label: '草稿（draft）' },
  { value: 'published', label: '已发布（published）' },
  { value: 'archived', label: '已归档（archived）' }
] as const

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档'
}

/** 列表查询条件 */
const keyword = ref('')
const status = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

interface ArticleListPayload {
  items: AdminArticleItem[]
  meta: AdminPageMeta
}

const listKey = computed(() =>
  `admin-articles:${keyword.value.trim()}:${status.value}:${page.value}:${pageSize.value}`
)

const {
  data: listData,
  status: listStatus,
  error: listError,
  refresh: refreshList
} = await useAsyncData<ArticleListPayload>(
  listKey,
  async () => {
    const payload = await $fetch<{
      data?: AdminArticleItem[]
      meta?: Record<string, unknown>
    }>('/api/admin/articles', {
      query: toAdminQuery({
        keyword: keyword.value.trim(),
        status: status.value,
        page: page.value,
        pageSize: pageSize.value
      })
    })
    const items = Array.isArray(payload?.data) ? payload.data : []
    let meta = toPageMeta(payload?.meta, { page: page.value, pageSize: pageSize.value })
    // 服务端会把越界页夹到最后一页；按夹取后的页码重取一次，避免 ?page=999 显示空表。
    if (page.value > meta.totalPages && meta.totalPages >= 1) {
      const retry = await $fetch<{ data?: AdminArticleItem[], meta?: Record<string, unknown> }>(
        '/api/admin/articles',
        {
          query: toAdminQuery({
            keyword: keyword.value.trim(),
            status: status.value,
            page: meta.totalPages,
            pageSize: pageSize.value
          })
        }
      )
      const retryItems = Array.isArray(retry?.data) ? retry.data : []
      meta = toPageMeta(retry?.meta, { page: meta.totalPages, pageSize: pageSize.value })
      page.value = meta.page
      return { items: retryItems, meta }
    }
    return { items, meta }
  },
  { watch: [listKey], default: defaultListPayload }
)

/** 未加载时的空载荷；总数与总页数一律等接口 meta，不自行估算。 */
function defaultListPayload(): ArticleListPayload {
  return {
    items: [],
    meta: { page: page.value, pageSize: pageSize.value, total: 0, totalPages: 1 }
  }
}

const items = computed(() => listData.value.items)
const meta = computed<AdminPageMeta>(() => listData.value.meta)
const isLoading = computed(() => listStatus.value === 'pending')
const listErrorMessage = computed(() => adminRequestErrorMessage(listError.value, '文章列表加载失败，请稍后重试'))

/** 分类选项：列表接口不提供分类字典接口，因此从当前列表响应里的 categoryId/categoryName 派生。 */
const categoryOptions = computed(() => {
  const seen = new Map<number, string>()
  for (const item of items.value) {
    if (item.categoryId !== null && item.categoryName && !seen.has(item.categoryId)) {
      seen.set(item.categoryId, item.categoryName)
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
})

/** 关键字 / 状态变化后回到第一页 */
watch([keyword, status], () => { page.value = 1 }, { flush: 'sync' })

/** 列表操作反馈 */
const notice = ref('')
const actionError = ref('')

/** 编辑器状态 */
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const saveError = ref('')

interface ArticleForm {
  title: string
  slug: string
  categoryId: string
  summary: string
  contentHtml: string
  publishedAt: string
  status: string
  isFeatured: boolean
}

const form = reactive<ArticleForm>({
  title: '',
  slug: '',
  categoryId: '',
  summary: '',
  contentHtml: '',
  publishedAt: '',
  status: 'draft',
  isFeatured: false
})

/** 正在编辑的文章标识；新建时为「（保存后由服务端生成）」 */
const slugHint = ref('')

const detailLoading = ref(false)
const detailError = ref('')

const titleError = computed(() => (form.title.trim() ? '' : '标题不能为空'))
const slugError = computed(() => (form.slug.trim() && !/^[a-z0-9-]+$/i.test(form.slug.trim())
  ? 'slug 只允许字母、数字与连字符（中文标题请留空，由服务端生成）'
  : ''))
const formValid = computed(() => !titleError.value && !slugError.value)

/** 打开新建表单 */
function openCreate() {
  editingId.value = null
  slugHint.value = ''
  form.title = ''
  form.slug = ''
  form.categoryId = ''
  form.summary = ''
  form.contentHtml = ''
  form.publishedAt = ''
  form.status = 'draft'
  form.isFeatured = false
  saveError.value = ''
  editorOpen.value = true
}

/** 打开编辑表单：按 id 取详情（含原始 contentHtml） */
async function openEdit(item: AdminArticleItem) {
  editorOpen.value = true
  editingId.value = item.id
  saveError.value = ''
  detailError.value = ''
  detailLoading.value = true
  form.title = item.title
  form.slug = item.slug
  form.categoryId = item.categoryId === null ? '' : String(item.categoryId)
  form.status = item.status || 'draft'
  form.isFeatured = item.isFeatured
  form.publishedAt = toDateTimeLocal(item.publishedAt)
  form.summary = item.summary
  form.contentHtml = ''
  slugHint.value = item.slug
  try {
    const detail = await requestAdminApi<{ article: AdminArticleDetail }>(
      `/api/admin/articles/${item.id}`
    )
    const article = detail.article
    form.title = article.title
    form.slug = article.slug
    form.categoryId = article.categoryId === null ? '' : String(article.categoryId)
    form.summary = article.summary
    form.contentHtml = article.contentHtml
    form.publishedAt = toDateTimeLocal(article.publishedAt)
    form.status = article.status || 'draft'
    form.isFeatured = article.isFeatured
    slugHint.value = article.slug
  } catch (error) {
    detailError.value = adminRequestErrorMessage(error, '文章详情加载失败，请稍后重试')
  } finally {
    detailLoading.value = false
  }
}

function closeEditor() {
  editorOpen.value = false
  editingId.value = null
  saveError.value = ''
  detailError.value = ''
}

/** 保存：新建走 POST，编辑走 PUT，成功后刷新列表 */
async function onSubmit() {
  if (!canWrite.value) {
    saveError.value = readOnlyReason
    return
  }
  if (!formValid.value) {
    saveError.value = titleError.value || slugError.value
    return
  }
  saving.value = true
  saveError.value = ''
  notice.value = ''
  actionError.value = ''
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    summary: form.summary,
    contentHtml: form.contentHtml,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    publishedAt: form.publishedAt || '',
    status: form.status,
    isFeatured: form.isFeatured
  }
  if (form.slug.trim()) body.slug = form.slug.trim()
  try {
    if (editingId.value === null) {
      await requestAdminApi<AdminWriteResult>('/api/admin/articles', { method: 'POST', body })
      notice.value = '文章已新建'
    } else {
      await requestAdminApi<AdminWriteResult>(`/api/admin/articles/${editingId.value}`, { method: 'PUT', body })
      notice.value = '文章已保存'
    }
    await refreshList()
    closeEditor()
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

/** 归档（软删除，不物理删除数据） */
async function onArchive(item: AdminArticleItem) {
  if (!canWrite.value) return
  if (!window.confirm(`确认归档《${item.title}》？归档会把状态改为「已归档」，数据仍保留在数据库中，不会物理删除。`)) return
  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`/api/admin/articles/${item.id}`, { method: 'DELETE' })
    notice.value = `《${item.title}》已归档（软删除，数据仍保留）`
    await refreshList()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '归档失败，请稍后重试')
  }
}

/** 每页条数变化 */
function onPageSize(next: number) {
  pageSize.value = next
  page.value = 1
}
</script>

<template>
  <PageContainer class="admin-articles" size="wide">
    <header class="admin-articles__head">
      <div>
        <h1 class="admin-articles__title">文章管理</h1>
        <p class="admin-articles__desc">
          维护资讯与法律解读文章。正文以 HTML 原文存储，公开站点读取时会先做白名单清洗。
        </p>
      </div>
      <BaseButton
        :disabled="!canWrite"
        :title="canWrite ? undefined : readOnlyReason"
        @click="openCreate"
      >
        新建文章
      </BaseButton>
    </header>

    <p v-if="!canWrite" class="admin-articles__readonly" role="note">
      {{ readOnlyReason }}
    </p>

    <p v-if="notice" class="admin-articles__notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="admin-articles__error" role="alert">{{ actionError }}</p>

    <BaseCard class="admin-articles__filters" title="筛选与搜索">
      <form class="admin-articles__filter-form" @submit.prevent="page = 1">
        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-keyword">关键词</label>
          <input
            id="article-keyword"
            v-model="keyword"
            class="admin-articles__input"
            type="search"
            placeholder="标题 / 摘要 / slug"
          >
        </div>
        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-status-filter">状态</label>
          <select id="article-status-filter" v-model="status" class="admin-articles__select">
            <option value="">全部状态</option>
            <option v-for="item in ARTICLE_STATUSES" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </div>
        <BaseButton variant="secondary" size="sm" type="submit">搜索</BaseButton>
      </form>
    </BaseCard>

    <section class="admin-articles__list" aria-label="文章列表" aria-live="polite">
      <template v-if="listError">
        <ErrorState title="文章列表加载失败" :message="listErrorMessage" @retry="refreshList" />
      </template>

      <template v-else>
        <p v-if="isLoading" class="admin-articles__loading" role="status">正在加载文章列表…</p>

        <div v-if="items.length" class="admin-articles__table-wrap">
          <table class="admin-articles__table">
            <caption class="admin-articles__caption">
              共 {{ meta.total }} 篇文章，当前第 {{ meta.page }} / {{ meta.totalPages }} 页
            </caption>
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">分类</th>
                <th scope="col">状态</th>
                <th scope="col">发布时间</th>
                <th scope="col">更新时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>
                  <span class="admin-articles__cell-title">{{ item.title }}</span>
                  <span class="admin-articles__cell-sub">{{ item.slug }}</span>
                </td>
                <td>{{ item.categoryName || '未分类' }}</td>
                <td>
                  {{ STATUS_LABELS[item.status] || item.status }}
                  <span v-if="item.isFeatured" class="admin-articles__badge">推荐</span>
                </td>
                <td>{{ item.publishedAt || '未发布' }}</td>
                <td>{{ item.updatedAt }}</td>
                <td class="admin-articles__cell-actions">
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="!canWrite"
                    :title="canWrite ? undefined : readOnlyReason"
                    @click="openEdit(item)"
                  >
                    编辑
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    :disabled="!canWrite || item.status === 'archived'"
                    :title="canWrite ? '归档为软删除，数据仍然保留' : readOnlyReason"
                    @click="onArchive(item)"
                  >
                    归档
                  </BaseButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="!isLoading" class="admin-articles__empty">
          <p class="admin-articles__empty-title">没有符合条件的文章</p>
          <p class="admin-articles__empty-desc">请调整关键词或状态筛选后重试。</p>
        </div>

        <AdminPager
          :page="meta.page"
          :total-pages="meta.totalPages"
          :total="meta.total"
          :page-size="meta.pageSize"
          noun="篇文章"
          @update:page="page = $event"
          @update:page-size="onPageSize"
        />
      </template>
    </section>

    <BaseCard
      v-if="editorOpen"
      class="admin-articles__editor"
      :title="editingId === null ? '新建文章' : `编辑文章 #${editingId}`"
      :title-level="2"
    >
      <p v-if="detailLoading" class="admin-articles__loading" role="status">正在加载文章详情…</p>
      <p v-if="detailError" class="admin-articles__error" role="alert">{{ detailError }}</p>

      <form class="admin-articles__form" novalidate @submit.prevent="onSubmit">
        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-title">标题（必填）</label>
          <input
            id="article-title"
            v-model="form.title"
            class="admin-articles__input"
            type="text"
            maxlength="255"
            :disabled="!canWrite"
            :aria-invalid="Boolean(titleError)"
          >
          <p v-if="titleError" class="admin-articles__hint admin-articles__hint--error">{{ titleError }}</p>
        </div>

        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-slug">slug（可选）</label>
          <input
            id="article-slug"
            v-model="form.slug"
            class="admin-articles__input"
            type="text"
            maxlength="191"
            :disabled="!canWrite"
            :aria-invalid="Boolean(slugError)"
            placeholder="留空时由标题生成"
          >
          <p class="admin-articles__hint">
            当前 slug：{{ slugHint || '（保存后由服务端生成）' }}。留空提交时服务端会按标题重新生成，
            中文标题会生成带短哈希的稳定 slug。
          </p>
          <p v-if="slugError" class="admin-articles__hint admin-articles__hint--error">{{ slugError }}</p>
        </div>

        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-category">分类</label>
          <select
            id="article-category"
            v-model="form.categoryId"
            class="admin-articles__select"
            :disabled="!canWrite"
          >
            <option value="">未分类</option>
            <option
              v-for="option in categoryOptions"
              :key="option.id"
              :value="String(option.id)"
            >
              {{ option.name }}
            </option>
            <option
              v-if="form.categoryId && !categoryOptions.some(option => String(option.id) === form.categoryId)"
              :value="form.categoryId"
            >
              当前分类（#{{ form.categoryId }}，不在当前页候选中）
            </option>
          </select>
          <p class="admin-articles__hint">
            后台没有单独的分类字典接口，选项由当前列表响应里的「分类 ID / 分类名称」派生，
            因此只包含本页出现过的分类；留空表示不修改/未分类。
          </p>
        </div>

        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-summary">摘要</label>
          <textarea
            id="article-summary"
            v-model="form.summary"
            class="admin-articles__textarea admin-articles__textarea--short"
            rows="3"
            :disabled="!canWrite"
          />
        </div>

        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-content">正文（HTML 原文，未清洗）</label>
          <p class="admin-articles__warning" role="note">
            正文以 HTML 原文入库，公开站点渲染前会由服务端做白名单清洗；这里看到的是未清洗的存储内容，
            请只填写可信来源的 HTML，避免粘贴带脚本的代码。
          </p>
          <textarea
            id="article-content"
            v-model="form.contentHtml"
            class="admin-articles__textarea admin-articles__textarea--code"
            rows="16"
            spellcheck="false"
            :disabled="!canWrite"
          />
        </div>

        <div class="admin-articles__grid">
          <div class="admin-articles__field">
            <label class="admin-articles__label" for="article-published">发布时间</label>
            <input
              id="article-published"
              v-model="form.publishedAt"
              class="admin-articles__input"
              type="datetime-local"
              :disabled="!canWrite"
            >
            <p class="admin-articles__hint">
              留空表示未发布时间；若状态为「已发布」而发布时间为空，服务端会自动补当前时间。
            </p>
          </div>

          <div class="admin-articles__field">
            <label class="admin-articles__label" for="article-status">状态</label>
            <select id="article-status" v-model="form.status" class="admin-articles__select" :disabled="!canWrite">
              <option v-for="item in ARTICLE_STATUSES" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </div>

          <div class="admin-articles__field admin-articles__field--check">
            <input
              id="article-featured"
              v-model="form.isFeatured"
              type="checkbox"
              :disabled="!canWrite"
            >
            <label class="admin-articles__label" for="article-featured">设为推荐（isFeatured）</label>
          </div>
        </div>

        <p v-if="saveError" class="admin-articles__error" role="alert">{{ saveError }}</p>
        <p v-if="!canWrite" class="admin-articles__readonly" role="note">{{ readOnlyReason }}</p>

        <div class="admin-articles__actions">
          <BaseButton
            type="submit"
            :disabled="!canWrite || !formValid || saving || detailLoading"
            :title="canWrite ? undefined : readOnlyReason"
          >
            {{ saving ? '保存中…' : '保存' }}
          </BaseButton>
          <BaseButton variant="secondary" :disabled="saving" @click="closeEditor">取消</BaseButton>
        </div>
      </form>
    </BaseCard>

    <p class="admin-articles__back">
      <NuxtLink to="/admin">返回后台首页</NuxtLink>
    </p>
  </PageContainer>
</template>

<style scoped>
.admin-articles {
  padding-block: var(--space-8) var(--space-16);
}

.admin-articles__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.admin-articles__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-articles__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-articles__readonly {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-articles__notice {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-success) 10%, transparent);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.admin-articles__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-articles__filters,
.admin-articles__editor {
  margin-top: var(--space-6);
}

.admin-articles__filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.admin-articles__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-articles__field--check {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
}

.admin-articles__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-articles__input,
.admin-articles__select,
.admin-articles__textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-base);
}

.admin-articles__input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.admin-articles__input:disabled,
.admin-articles__select:disabled,
.admin-articles__textarea:disabled {
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-articles__textarea {
  width: 100%;
  resize: vertical;
}

.admin-articles__textarea--short {
  max-width: 640px;
}

.admin-articles__textarea--code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.admin-articles__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-articles__hint--error {
  color: var(--color-error);
}

.admin-articles__warning {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
  font-size: var(--text-xs);
}

.admin-articles__list {
  margin-top: var(--space-6);
}

.admin-articles__loading {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-articles__table-wrap {
  overflow-x: auto;
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.admin-articles__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-articles__caption {
  padding: var(--space-3);
  text-align: left;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.admin-articles__table th,
.admin-articles__table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.admin-articles__table th {
  background-color: var(--color-bg-light);
  color: var(--color-text);
  font-weight: 600;
  white-space: nowrap;
}

.admin-articles__cell-title {
  display: block;
  font-weight: 600;
  color: var(--color-text);
}

.admin-articles__cell-sub {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  word-break: break-all;
}

.admin-articles__badge {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: var(--text-xs);
}

.admin-articles__cell-actions {
  display: flex;
  gap: var(--space-2);
  white-space: nowrap;
}

.admin-articles__empty {
  padding: var(--space-12) var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}

.admin-articles__empty-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}

.admin-articles__empty-desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-articles__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-articles__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
}

.admin-articles__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.admin-articles__back {
  margin-top: var(--space-6);
  font-size: var(--text-sm);
}
</style>
