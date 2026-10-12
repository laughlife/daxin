<script setup lang="ts">
import { computed, ref } from 'vue'
import { ADMIN_PAGE_SIZE, adminRequestErrorMessage, toAdminQuery, toPageMeta, type AdminPageMeta } from '~/utils/adminApi'

/**
 * 侧边栏管理（/admin/sidebar）。
 *
 * 需求：「对推荐阅读内容进行添加及修改，用文章模块的方式，需要表示为侧边栏显示」。
 *
 * 因此本模块不是独立的数据表，而是**文章的一个视图**：
 *   - 列表只显示 `show_in_sidebar = 1` 的文章（首页侧栏「推荐阅读」的内容来源）；
 *   - 「添加」「编辑」直接复用文章管理（跳转到 /admin/articles，并带上该文章的编辑入口），
 *     避免同一份内容维护两套表单；
 *   - 每行都有显式的「侧边栏显示」标记，可在这里直接取消/恢复，
 *     不需要进文章详情改。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '侧边栏管理',
  description: '首页侧栏推荐阅读内容维护。',
  robots: 'noindex, nofollow'
})

interface SidebarArticle {
  id: number
  slug: string
  title: string
  summary: string
  categoryName: string
  publishedAt: string
  status: string
  isFeatured: boolean
  showInSidebar: boolean
  updatedAt: string
}

const requestFetch = useRequestFetch()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(ADMIN_PAGE_SIZE)
const listKey = computed(() => `admin-sidebar:${keyword.value.trim()}:${page.value}:${pageSize.value}`)

const loadError = ref('')
const actionError = ref('')
const actionOk = ref('')
const busyId = ref<number | null>(null)

const { data, status, refresh } = await useAsyncData(
  listKey,
  async () => {
    const payload = await requestFetch<{ data?: SidebarArticle[], meta?: Record<string, unknown> }>(
      '/api/admin/articles',
      { query: toAdminQuery({ keyword: keyword.value.trim(), sidebar: '1', page: page.value, pageSize: pageSize.value }) }
    )
    return {
      items: Array.isArray(payload?.data) ? payload.data : [],
      meta: toPageMeta(payload?.meta, { page: page.value, pageSize: pageSize.value }),
    }
  },
  { watch: [listKey], default: () => ({ items: [] as SidebarArticle[], meta: { page: 1, pageSize: ADMIN_PAGE_SIZE, total: 0, totalPages: 1 } as AdminPageMeta }) }
)

const items = computed(() => data.value.items)
const meta = computed(() => data.value.meta)
const isLoading = computed(() => status.value === 'pending')

/**
 * 切换侧边栏标记。
 * 服务端只接受显式给出的字段，因此这里只发 id 与 showInSidebar，不动其它内容。
 */
async function toggleSidebar(item: SidebarArticle, next: boolean) {
  busyId.value = item.id
  actionError.value = ''
  actionOk.value = ''
  try {
    await requestFetch(`/api/admin/articles/${item.id}`, { method: 'PUT', body: { showInSidebar: next } })
    actionOk.value = next ? `已把「${item.title}」加入侧边栏` : `已把「${item.title}」移出侧边栏`
    await refresh()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '侧边栏标记保存失败，请稍后重试')
  } finally {
    busyId.value = null
  }
}

function resetFilter() {
  keyword.value = ''
  page.value = 1
}
</script>

<template>
  <section class="admin-sidebar">
    <header class="admin-sidebar__head">
      <div>
        <h1>侧边栏管理</h1>
        <p>这里维护首页侧栏「推荐阅读」显示的文章。内容编辑复用文章管理，保存方式完全一致。</p>
      </div>
      <BaseButton to="/admin/articles" variant="secondary" size="sm">前往文章管理添加</BaseButton>
    </header>

    <form class="admin-sidebar__filters" @submit.prevent>
      <label for="sidebar-keyword">关键词</label>
      <input
        id="sidebar-keyword"
        v-model="keyword"
        type="search"
        placeholder="标题、摘要或 slug"
      >
      <BaseButton type="button" variant="secondary" size="sm" :disabled="!keyword" @click="resetFilter">
        清空
      </BaseButton>
    </form>

    <p v-if="actionOk" class="admin-sidebar__ok" role="status">{{ actionOk }}</p>
    <p v-if="actionError" class="admin-sidebar__error" role="alert">{{ actionError }}</p>

    <ErrorState
      v-if="loadError"
      title="侧边栏内容加载失败"
      :message="loadError"
      @retry="refresh"
    />
    <template v-else>
      <p v-if="isLoading" class="admin-sidebar__status">正在加载…</p>
      <p v-else-if="items.length === 0" class="admin-sidebar__status">
        侧边栏当前没有内容。到「文章管理」编辑任意文章并勾选「在侧边栏显示」即可加入。
      </p>
      <table v-else class="admin-sidebar__table">
        <thead>
          <tr>
            <th scope="col">标题</th>
            <th scope="col">分类</th>
            <th scope="col">发布时间</th>
            <th scope="col">状态</th>
            <th scope="col">侧边栏显示</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td class="admin-sidebar__title">{{ item.title }}</td>
            <td>{{ item.categoryName || '—' }}</td>
            <td>{{ item.publishedAt || '—' }}</td>
            <td>{{ item.status }}</td>
            <td>
              <label class="admin-sidebar__toggle">
                <input
                  type="checkbox"
                  :checked="item.showInSidebar"
                  :disabled="busyId === item.id"
                  @change="toggleSidebar(item, ($event.target as HTMLInputElement).checked)"
                >
                <span>{{ item.showInSidebar ? '显示' : '不显示' }}</span>
              </label>
            </td>
            <td>
              <NuxtLink class="admin-sidebar__link" :to="`/admin/articles?id=${item.id}`">编辑内容</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>

      <AdminPager
        :page="meta.page"
        :page-size="meta.pageSize"
        :total="meta.total"
        :total-pages="meta.totalPages"
        @update:page="page = $event"
      />
    </template>
  </section>
</template>

<style scoped>
.admin-sidebar { display:flex; flex-direction:column; gap:var(--space-5); }
.admin-sidebar__head { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-4); flex-wrap:wrap; }
.admin-sidebar__head h1 { font-size:var(--text-2xl); }
.admin-sidebar__head p { margin-top:var(--space-2); max-width:60ch; color:var(--color-text-muted); font-size:var(--text-sm); }
.admin-sidebar__filters { display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap; }
.admin-sidebar__filters label { font-size:var(--text-sm); font-weight:600; }
.admin-sidebar__filters input { padding:var(--space-2) var(--space-3); border:1px solid var(--color-border-strong); border-radius:var(--radius-md); font:inherit; font-size:var(--text-sm); min-width:260px; }
.admin-sidebar__status { color:var(--color-text-muted); font-size:var(--text-sm); }
.admin-sidebar__ok { padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); background-color:var(--color-primary-light); color:var(--color-text); font-size:var(--text-sm); }
.admin-sidebar__error { padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); background-color:var(--color-primary-light); color:var(--color-primary); font-size:var(--text-sm); }
.admin-sidebar__table { width:100%; border-collapse:collapse; background-color:var(--color-bg-page); border:1px solid var(--color-border); border-radius:var(--radius-lg); overflow:hidden; }
.admin-sidebar__table th, .admin-sidebar__table td { padding:var(--space-3) var(--space-4); text-align:left; font-size:var(--text-sm); border-bottom:1px solid var(--color-border); vertical-align:middle; }
.admin-sidebar__table th { background-color:var(--color-bg-light); font-weight:600; white-space:nowrap; }
.admin-sidebar__title { max-width:36ch; }
.admin-sidebar__toggle { display:inline-flex; align-items:center; gap:var(--space-2); }
.admin-sidebar__link { color:var(--color-primary); font-weight:600; white-space:nowrap; }
</style>
