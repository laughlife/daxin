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
// 正文白名单清洗已移到 AdminArticlePreview 组件内，本页不再直接使用 sanitizeHtml

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

/**
 * 后台接口必须用 useRequestFetch：SSR 期间对 /api/admin/** 的相对请求要转发用户请求头
 * （含 HttpOnly 会话 Cookie），否则服务端取不到登录态，已登录用户首屏会看到「未登录」。
 */
const requestFetch = useRequestFetch()

const canWrite = computed(() => canWriteContent(user.value))
const readOnlyReason = READ_ONLY_NOTICE

interface ArticleCategoryOption {
  id: number
  slug: string
  name: string
}

const {
  data: categoryData,
  status: categoryStatus,
  error: categoryError,
  refresh: refreshCategories,
} = await useAsyncData<ArticleCategoryOption[]>(
  'admin-article-categories',
  async () => {
    const payload = await requestFetch<{ data?: ArticleCategoryOption[] }>('/api/admin/article-categories')
    return Array.isArray(payload?.data) ? payload.data : []
  },
  { default: () => [] },
)
const categoryOptions = computed(() => categoryData.value ?? [])
const categoryErrorMessage = computed(() => categoryError.value
  ? adminRequestErrorMessage(categoryError.value, '文章分类加载失败，请稍后重试')
  : '')

/** 列表查询条件 */
const keyword = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)

interface ArticleListPayload {
  items: AdminArticleItem[]
  meta: AdminPageMeta
}

const listKey = computed(() =>
  `admin-articles:${keyword.value.trim()}:${page.value}:${pageSize.value}`
)


const {
  data: listData,
  status: listStatus,
  error: listError,
  refresh: refreshList
} = await useAsyncData<ArticleListPayload>(
  listKey,
  async () => {
    const payload = await requestFetch<{
      data?: AdminArticleItem[]
      meta?: Record<string, unknown>
    }>('/api/admin/articles', {
      query: toAdminQuery({
        keyword: keyword.value.trim(),
        page: page.value,
        pageSize: pageSize.value
      })
    })
    const items = Array.isArray(payload?.data) ? payload.data : []
    let meta = toPageMeta(payload?.meta, { page: page.value, pageSize: pageSize.value })
    // 服务端会把越界页夹到最后一页；按夹取后的页码重取一次，避免 ?page=999 显示空表。
    if (page.value > meta.totalPages && meta.totalPages >= 1) {
      const retry = await requestFetch<{ data?: AdminArticleItem[], meta?: Record<string, unknown> }>(
        '/api/admin/articles',
        {
          query: toAdminQuery({
            keyword: keyword.value.trim(),
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

/** 关键字 / 状态变化后回到第一页 */
watch(keyword, () => { page.value = 1 }, { flush: 'sync' })

/** 列表操作反馈 */
const notice = ref('')
const actionError = ref('')

/** 编辑器状态 */
const editorOpen = ref(false)
const previewOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const saveError = ref('')

/**
 * 表单容器引用 + 打开表单后滚动到表单区域。
 * 列表在上、表单在下，不滚动的话点「编辑」后视口仍停在列表，看起来像没反应。
 */
const editorRef = ref<HTMLElement | null>(null)
const { requestScrollToEditor, scrollToEditor } = useScrollToEditor(editorRef, { selector: '[data-scroll-target="article-editor"]' })

/** 当前路由：支持 /admin/articles?id=N 深链并直接定位文章编辑表单。 */
const route = useRoute()

interface ArticleForm {
  title: string
  slug: string
  categoryId: string
  contentHtml: string
  publishedAt: string
  status: string
  isFeatured: boolean
  showInSidebar: boolean
}

const form = reactive<ArticleForm>({
  title: '',
  slug: '',
  categoryId: '',
  contentHtml: '',
  publishedAt: '',
  status: 'draft',
  isFeatured: false,
  showInSidebar: false
})
const previewCategory = computed(() => categoryOptions.value.find(option => String(option.id) === form.categoryId)?.name || '未分类')

/**
 * 列表里的「预览内容」独立于编辑器预览：
 * 列表接口只返回标题/分类，不含正文，所以点预览时按 id 拉一次详情。
 * 单独维护一份状态，避免与编辑器预览（previewOpen）互相干扰。
 */
const listPreviewOpen = ref(false)
const listPreviewLoading = ref(false)
const listPreviewError = ref('')
const listPreviewArticle = ref<{
  title: string
  contentHtml: string
  meta: string
} | null>(null)

/** 列表预览里的状态中文名（与表单里的状态下拉保持同一套说法）。 */
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

/** 列表预览的头部元信息：分类 · 发布时间（或状态）· 站点名。 */
function toPreviewMeta(item: AdminArticleItem): string {
  const statusText = item.status === 'published' ? '' : (STATUS_LABELS[item.status] ?? item.status)
  return [item.categoryName || '未分类', item.publishedAt || statusText || '未发布', '大信法务'].join(' · ')
}

/** 打开某篇文章的内容预览（按需取正文）。 */
async function openListPreview(item: AdminArticleItem) {
  listPreviewOpen.value = true
  listPreviewLoading.value = true
  listPreviewError.value = ''
  // 先用列表已有字段渲染骨架，正文到位后补齐，避免弹层空白
  listPreviewArticle.value = {
    title: item.title,
    contentHtml: '',
    meta: toPreviewMeta(item),
  }
  try {
    const detail = await requestAdminApi<{ article: AdminArticleDetail }>(
      `/api/admin/articles/${item.id}`,
      { requestFetch },
    )
    const article = detail.article
    listPreviewArticle.value = {
      title: article.title || item.title,
      contentHtml: article.contentHtml,
      meta: toPreviewMeta(item),
    }
  } catch (error) {
    listPreviewError.value = adminRequestErrorMessage(error, '文章内容加载失败，请稍后重试')
  } finally {
    listPreviewLoading.value = false
  }
}

function closeListPreview() {
  listPreviewOpen.value = false
  listPreviewError.value = ''
}

const detailLoading = ref(false)
const detailError = ref('')

const titleError = computed(() => (form.title.trim() ? '' : '标题不能为空'))
const formValid = computed(() => !titleError.value)

/** 打开新建表单 */
async function openCreate() {
  previewOpen.value = false
  editingId.value = null
  form.title = ''
  form.slug = ''
  form.categoryId = ''
  form.contentHtml = ''
  form.publishedAt = ''
  form.status = 'draft'
  form.isFeatured = false
  saveError.value = ''
  editorOpen.value = true
  // 不阻塞：等滚动完成会拖住 setup，见 requestScrollToEditor 的说明
  requestScrollToEditor()
}

/** 打开编辑表单：按 id 取详情（含原始 contentHtml） */
async function openEdit(item: AdminArticleItem) {
  previewOpen.value = false
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
  form.showInSidebar = item.showInSidebar === true
  form.publishedAt = toDateTimeLocal(item.publishedAt)
  form.contentHtml = ''
  try {
    const detail = await requestAdminApi<{ article: AdminArticleDetail }>(
      `/api/admin/articles/${item.id}`,
      { requestFetch }
    )
    const article = detail.article
    form.title = article.title
    form.slug = article.slug
    form.categoryId = article.categoryId === null ? '' : String(article.categoryId)
    form.contentHtml = article.contentHtml
    form.publishedAt = toDateTimeLocal(article.publishedAt)
    form.status = article.status || 'draft'
    form.isFeatured = article.isFeatured
    form.showInSidebar = article.showInSidebar === true
  } catch (error) {
    detailError.value = adminRequestErrorMessage(error, '文章详情加载失败，请稍后重试')
  } finally {
    detailLoading.value = false
  }
  /*
   * 详情到位后再滚一次。
   *
   * 前面那次滚动发生在编辑态刚打开时，此时：
   *   - 通过深链（从侧边栏点「编辑内容」跳过来）进入时，setup 阶段 DOM 还没渲染，
   *     editorRef 为 null，滚动直接 return，什么都没发生；
   *   - 即便 DOM 已在，表单高度还会随详情内容变化，滚动位置随之偏掉。
   * 因此在内容填好之后再滚一次。
   *
   * 必须用不阻塞的 requestScrollToEditor：滚动内部要等元素出现并等动画停下，
   * 若在这里 await，openEdit 会迟迟不返回，深链场景下组件挂载被拖住，
   * 表单反而完全不渲染（实测出现过）。
   */
  requestScrollToEditor()
}

function closeEditor() {
  previewOpen.value = false
  editorOpen.value = false
  editingId.value = null
  saveError.value = ''
  detailError.value = ''
}

/** 保存：新建走 POST，编辑走 PUT，成功后刷新列表 */
async function onSubmit(publish = false) {
  if (!canWrite.value) {
    saveError.value = readOnlyReason
    return
  }
  if (!formValid.value) {
    saveError.value = titleError.value
    return
  }
  saving.value = true
  saveError.value = ''
  notice.value = ''
  actionError.value = ''
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    contentHtml: form.contentHtml,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    publishedAt: form.publishedAt || '',
    status: publish ? 'published' : form.status,
    isFeatured: form.isFeatured,
    showInSidebar: form.showInSidebar
  }
  if (form.slug.trim()) body.slug = form.slug.trim()
  try {
    if (editingId.value === null) {
      await requestAdminApi<AdminWriteResult>('/api/admin/articles', { method: 'POST', body, requestFetch })
      notice.value = publish ? '文章已发布' : '文章已新建'
    } else {
      await requestAdminApi<AdminWriteResult>(`/api/admin/articles/${editingId.value}`, { method: 'PUT', body, requestFetch })
      notice.value = publish ? '文章已发布' : '文章已保存'
    }
    await refreshList()
    previewOpen.value = false
    closeEditor()
  } catch (error) {
    saveError.value = adminRequestErrorMessage(error, '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function onFormSubmit() { return onSubmit(false) }

/** 归档（软删除，不物理删除数据） */
async function onArchive(item: AdminArticleItem) {
  if (!canWrite.value) return
  if (!window.confirm(`确认归档《${item.title}》？归档会把状态改为「已归档」，数据仍保留在数据库中，不会物理删除。`)) return
  actionError.value = ''
  notice.value = ''
  try {
    await requestAdminApi<AdminWriteResult>(`/api/admin/articles/${item.id}`, { method: 'DELETE', requestFetch })
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
/**
 * 深链支持：/admin/articles?id=<文章ID> 直接打开该文章的编辑表单。
 *
 * 管理界面的文章深链可以直接打开指定文章；
 * 只靠列表点击的话，跨页面跳转进去会停在列表页，编辑意图丢失。
 * 客户端与服务端都执行，保证 SSR 首次渲染就是编辑态。
 */
async function openFromQuery() {
  const raw = route.query.id
  const id = Number.parseInt(String(Array.isArray(raw) ? raw[0] : raw ?? ''), 10)
  if (!Number.isSafeInteger(id) || id <= 0) return
  const existing = items.value.find((entry) => entry.id === id)
  if (existing) {
    await openEdit(existing)
    return
  }
  // 目标文章不在当前列表页（例如被筛选掉了）：按最小字段直接进入编辑态，
  // openEdit 会立即用详情接口覆盖这些占位值。
  await openEdit({
    id,
    slug: '',
    title: '',
    categoryId: null,
    categoryName: '',
    publishedAt: '',
    status: '',
    isFeatured: false,
    showInSidebar: false,
    updatedAt: ''
  } as AdminArticleItem)
}

/**
 * 编辑表单出现后滚动到它。
 *
 * 为什么监听 editorOpen 而不是 route.query.id：
 *   深链场景下表单要等详情请求回来才渲染，在 setup 早期触发滚动时元素还不存在，
 *   「等元素出现」会一路等到超时；editorOpen 变为 true 才是表单确实要出现的信号。
 *
 * 为什么 flush: 'post'：
 *   让回调在 DOM 更新之后执行，此时元素已挂上，配合 composable 里的
 *   waitForElement（ref + data-scroll-target 查询兜底）即可稳定拿到元素。
 *
 * 为什么不 await：
 *   这仍在 setup 挂载流程里，等待滚动完成会拖住挂载（实测会导致表单完全不渲染）。
 */
watch(
  editorOpen,
  (open) => {
    if (!open) return
    requestScrollToEditor()
  },
  { immediate: true, flush: 'post' },
)

if (import.meta.client) {
  await openFromQuery()
} else {
  await openFromQuery()
}
</script>

<template>
  <PageContainer class="admin-articles" size="wide">
    <p v-if="!canWrite" class="admin-articles__readonly" role="note">
      {{ readOnlyReason }}
    </p>

    <p v-if="notice" class="admin-articles__notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="admin-articles__error" role="alert">{{ actionError }}</p>

    <form class="admin-articles__filters admin-articles__filter-form" role="search" @submit.prevent="page = 1">
        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-keyword">关键词</label>
          <input
            id="article-keyword"
            v-model="keyword"
            class="admin-articles__input"
            type="search"
            placeholder="标题 / slug"
          >
        </div>
        <BaseButton variant="secondary" size="sm" type="submit">搜索</BaseButton>
        <BaseButton
          type="button"
          :disabled="!canWrite"
          :title="canWrite ? undefined : readOnlyReason"
          @click="openCreate"
        >新建文章</BaseButton>
    </form>

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
                <td><span v-if="item.isFeatured" class="admin-articles__badge">推荐</span>{{ item.publishedAt || '未发布' }}</td>
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
                    variant="primary"
                    size="sm"
                    class="admin-articles__preview-button"
                    :title="'预览该文章的正文显示效果'"
                    @click="openListPreview(item)"
                  >
                    预览内容
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
          <p class="admin-articles__empty-desc">请调整关键词后重试。</p>
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

    <!--
      ref 必须挂在原生元素上，不能挂在 BaseCard 这类组件上：
      组件上的 ref 拿到的是组件实例（没有 scrollIntoView），
      上次就是因为把 ref 放在组件上导致滚动静默失效。
    -->
    <div v-if="editorOpen" ref="editorRef" data-scroll-target="article-editor" class="admin-articles__editor">
      <BaseCard
        :title="editingId === null ? '新建文章' : `编辑文章 #${editingId}`"
        :title-level="2"
      >
      <p v-if="detailLoading" class="admin-articles__loading" role="status">正在加载文章详情…</p>
      <p v-if="detailError" class="admin-articles__error" role="alert">{{ detailError }}</p>

      <form class="admin-articles__form" novalidate @submit.prevent="onFormSubmit">
        <div v-if="categoryErrorMessage" class="admin-articles__error" role="alert">
          <span>{{ categoryErrorMessage }}</span>
          <BaseButton type="button" variant="ghost" size="sm" @click="refreshCategories">重试</BaseButton>
        </div>
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
          <label class="admin-articles__label" for="article-category">分类</label>
          <select
            id="article-category"
            v-model="form.categoryId"
            class="admin-articles__select"
            :disabled="!canWrite || categoryStatus === 'pending' || Boolean(categoryError)"
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
              当前分类（#{{ form.categoryId }}）
            </option>
          </select>
        </div>

        <div class="admin-articles__field">
          <label class="admin-articles__label" for="article-content">正文</label>
          <AdminRichTextEditor v-model="form.contentHtml" :disabled="!canWrite" />
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
          <BaseButton type="button" variant="secondary" :disabled="!canWrite || !formValid || saving || detailLoading" @click="onSubmit(true)">发布文章</BaseButton>
          <BaseButton type="button" variant="ghost" :disabled="detailLoading" @click="previewOpen = true">文章预览</BaseButton>
          <BaseButton type="button" variant="secondary" :disabled="saving" @click="closeEditor">取消</BaseButton>
        </div>
      </form>
      </BaseCard>
    </div>

    <!-- 编辑器预览：与列表预览共用同一个组件，正文清洗口径一致 -->
    <AdminArticlePreview
      :open="previewOpen"
      :title="form.title"
      :content-html="form.contentHtml"
      :meta="`${previewCategory} · ${form.publishedAt || '预览'} · 大信法务`"
      @close="previewOpen = false"
    />

    <!-- 列表「预览内容」：正文按需从详情接口取 -->
    <AdminArticlePreview
      :open="listPreviewOpen"
      :title="listPreviewArticle?.title ?? ''"
      :content-html="listPreviewArticle?.contentHtml ?? ''"
      :meta="listPreviewArticle?.meta ?? ''"
      :loading="listPreviewLoading"
      :error="listPreviewError"
      @close="closeListPreview"
    />

  </PageContainer>
</template>

<style scoped>
.admin-articles {
  padding-block: var(--space-8) var(--space-16);
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

.admin-articles__filters {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
}

.admin-articles__filter-form {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-4);
}

.admin-articles__filter-form .admin-articles__field { display: flex; flex: 1 1 auto; min-width: 0; gap: var(--space-3); }
.admin-articles__filter-form .admin-articles__label { flex: 0 0 auto; white-space: nowrap; }
.admin-articles__filter-form .admin-articles__input { flex: 1 1 auto; min-width: 0; }

@media (max-width: 520px) {
  .admin-articles__filter-form { flex-wrap: wrap; gap: var(--space-3); }
  .admin-articles__filter-form .admin-articles__field { flex: 1 1 100%; }
}

.admin-articles__field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
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

.admin-articles__hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.admin-articles__hint--error {
  color: var(--color-error);
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

.admin-articles__preview-button {
  font-weight: 650;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--color-primary) 20%, transparent);
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

/*
 * 预览弹层的样式已随实现移入 AdminArticlePreview 组件，
 * 编辑器与列表共用同一份样式，这里不再重复定义。
 */

</style>
