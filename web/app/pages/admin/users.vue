<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { UserRole } from '~/types/admin'
import { adminRequestErrorMessage, requestAdminApi } from '~/utils/adminApi'

definePageMeta({ layout: 'admin', middleware: 'admin' })

useSeoMeta({
  title: '用户与权限',
  description: '管理后台账号、角色分配与访问权限。',
  robots: 'noindex, nofollow'
})

interface ManagedUser {
  id: number
  username: string
  displayName: string
  status: 'active' | 'disabled' | string
  roles: UserRole[]
  lastLoginAt: string
  createdAt: string
}

type FormMode = 'create' | 'edit'

const ROLE_OPTIONS: Array<{ value: UserRole, label: string }> = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '内容编辑' },
  { value: 'viewer', label: '只读查看' }
]

const requestFetch = useRequestFetch()
const { user, load } = useAdminSession()
await load()

const users = ref<ManagedUser[]>([])
const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const saving = ref(false)
const deletingId = ref<number | null>(null)

const keyword = ref('')
const appliedKeyword = ref('')
const roleFilter = ref<UserRole | ''>('')

const panelOpen = ref(false)
const formMode = ref<FormMode>('create')
const editingId = ref<number | null>(null)
const formError = ref('')
const form = reactive<{
  username: string
  displayName: string
  password: string
  roles: UserRole[]
  status: 'active' | 'disabled'
}>({
  username: '',
  displayName: '',
  password: '',
  roles: ['viewer'],
  status: 'active'
})

const panelTitle = computed(() => formMode.value === 'create' ? '新建账号' : '编辑账号')
const isSelf = computed(() => editingId.value !== null && editingId.value === user.value?.id)

function resetForm() {
  form.username = ''
  form.displayName = ''
  form.password = ''
  form.roles = ['viewer']
  form.status = 'active'
  editingId.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  formMode.value = 'create'
  panelOpen.value = true
  actionError.value = ''
  actionSuccess.value = ''
}

function openEdit(item: ManagedUser) {
  resetForm()
  formMode.value = 'edit'
  editingId.value = item.id
  form.username = item.username
  form.displayName = item.displayName
  form.roles = [...item.roles]
  form.status = item.status === 'disabled' ? 'disabled' : 'active'
  panelOpen.value = true
  actionError.value = ''
  actionSuccess.value = ''
}

function closePanel() {
  if (saving.value) return
  panelOpen.value = false
  resetForm()
}

function toggleRole(role: UserRole) {
  if (form.roles.includes(role)) {
    if (form.roles.length > 1) form.roles = form.roles.filter(item => item !== role)
    return
  }
  form.roles = [...form.roles, role]
}

function validateForm(): string {
  if (formMode.value === 'create' && !form.username.trim()) return '请输入用户名'
  if (!form.displayName.trim()) return '请输入显示名'
  if (formMode.value === 'create' && !form.password) return '请输入初始密码'
  if (form.password && form.password.length < 8) return '密码至少需要 8 个字符'
  if (form.roles.length === 0) return '至少选择一个角色'
  return ''
}

async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    users.value = await requestAdminApi<ManagedUser[]>('/api/admin/users', {
      query: {
        keyword: appliedKeyword.value,
        role: roleFilter.value,
      },
      requestFetch
    })
  } catch (error) {
    loadError.value = adminRequestErrorMessage(error, '账号列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  appliedKeyword.value = keyword.value.trim()
  void loadUsers()
}

function resetFilters() {
  keyword.value = ''
  appliedKeyword.value = ''
  roleFilter.value = ''
  void loadUsers()
}

async function submitForm() {
  if (saving.value) return
  formError.value = validateForm()
  if (formError.value) return

  saving.value = true
  formError.value = ''
  actionError.value = ''
  actionSuccess.value = ''
  try {
    if (formMode.value === 'create') {
      await requestAdminApi<{ id: number }>('/api/admin/users', {
        method: 'POST',
        body: {
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          password: form.password,
          roles: form.roles,
          status: form.status
        },
        requestFetch
      })
      actionSuccess.value = '账号已创建'
    } else if (editingId.value !== null) {
      const body: Record<string, unknown> = {
        displayName: form.displayName.trim(),
        roles: form.roles,
        status: form.status
      }
      if (form.password) body.password = form.password
      await requestAdminApi<{ id: number }>(`/api/admin/users/${editingId.value}`, {
        method: 'PUT',
        body,
        requestFetch
      })
      actionSuccess.value = '账号已更新'
    }
    panelOpen.value = false
    resetForm()
    await loadUsers()
  } catch (error) {
    formError.value = adminRequestErrorMessage(error, '账号保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function removeUser(item: ManagedUser) {
  if (deletingId.value !== null || item.id === user.value?.id) return
  if (!window.confirm(`确定删除账号“${item.username}”吗？删除后该账号的登录会话也会失效。`)) return

  deletingId.value = item.id
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await requestAdminApi<{ id: number, deleted: boolean }>(`/api/admin/users/${item.id}`, {
      method: 'DELETE',
      requestFetch
    })
    actionSuccess.value = '账号已删除'
    await loadUsers()
  } catch (error) {
    actionError.value = adminRequestErrorMessage(error, '账号删除失败，请稍后重试')
  } finally {
    deletingId.value = null
  }
}

function roleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find(item => item.value === role)?.label ?? role
}

await loadUsers()
</script>

<template>
  <PageContainer class="admin-users" size="wide">
    <header class="admin-users__head">
      <div>
        <h1 class="admin-users__title">用户与权限</h1>
      </div>
      <BaseButton @click="openCreate">新建账号</BaseButton>
    </header>

    <p v-if="actionSuccess" class="admin-users__success" role="status">{{ actionSuccess }}</p>
    <p v-if="actionError" class="admin-users__error" role="alert">{{ actionError }}</p>

    <form class="admin-users__filters" role="search" @submit.prevent="applyFilters">
      <label class="admin-users__filter">
        <span>关键词</span>
        <input v-model="keyword" type="search" placeholder="用户名或显示名">
      </label>
      <label class="admin-users__filter">
        <span>角色</span>
        <select v-model="roleFilter">
          <option value="">全部角色</option>
          <option v-for="item in ROLE_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <div class="admin-users__filter-actions">
        <BaseButton type="submit" variant="secondary" :disabled="loading">查询</BaseButton>
        <BaseButton type="button" variant="ghost" :disabled="loading" @click="resetFilters">重置</BaseButton>
      </div>
    </form>

    <section class="admin-users__card" aria-labelledby="admin-users-list-title">
      <div class="admin-users__card-head">
        <h2 id="admin-users-list-title">账号列表</h2>
        <span class="admin-users__count">共 {{ users.length }} 个账号</span>
      </div>
      <p v-if="loading" class="admin-users__state" role="status">正在加载账号列表…</p>
      <ErrorState v-else-if="loadError" title="账号列表加载失败" :message="loadError" @retry="loadUsers" />
      <p v-else-if="users.length === 0" class="admin-users__state" role="status">暂无账号</p>
      <div v-else class="admin-users__table-wrap">
        <table class="admin-users__table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>显示名</th>
              <th>角色</th>
              <th>最近登录</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in users" :key="item.id">
              <td data-label="用户名"><strong>{{ item.username }}</strong></td>
              <td data-label="显示名">{{ item.displayName }}</td>
              <td data-label="角色">
                <span v-for="role in item.roles" :key="role" class="admin-users__role">{{ roleLabel(role) }}</span>
              </td>
              <td data-label="最近登录">{{ item.lastLoginAt || '从未登录' }}</td>
              <td data-label="创建时间">{{ item.createdAt || '—' }}</td>
              <td data-label="操作" class="admin-users__actions">
                <BaseButton variant="ghost" size="sm" :disabled="deletingId !== null" @click="openEdit(item)">编辑</BaseButton>
                <BaseButton variant="ghost" size="sm" :disabled="deletingId !== null || item.id === user?.id" @click="removeUser(item)">
                  {{ deletingId === item.id ? '删除中…' : '删除' }}
                </BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="panelOpen" class="admin-users__overlay" @click.self="closePanel">
      <aside class="admin-users__panel" aria-labelledby="admin-users-form-title">
        <div class="admin-users__panel-head">
          <h2 id="admin-users-form-title">{{ panelTitle }}</h2>
          <button type="button" class="admin-users__close" aria-label="关闭" :disabled="saving" @click="closePanel">×</button>
        </div>
        <form class="admin-users__form" @submit.prevent="submitForm">
          <label>
            <span>用户名</span>
            <input v-model="form.username" type="text" autocomplete="username" :readonly="formMode === 'edit'" :disabled="saving">
          </label>
          <label>
            <span>显示名</span>
            <input v-model="form.displayName" type="text" autocomplete="name" :disabled="saving">
          </label>
          <label>
            <span>{{ formMode === 'create' ? '初始密码' : '新密码（留空不修改）' }}</span>
            <input v-model="form.password" type="password" autocomplete="new-password" :disabled="saving">
          </label>
          <fieldset>
            <legend>角色</legend>
            <label v-for="item in ROLE_OPTIONS" :key="item.value" class="admin-users__check">
              <input type="checkbox" :checked="form.roles.includes(item.value)" :disabled="saving" @change="toggleRole(item.value)">
              <span>{{ item.label }}</span>
            </label>
          </fieldset>
          <p v-if="isSelf" class="admin-users__hint">当前账号不能停用自己或修改自己的角色。</p>
          <p v-if="formError" class="admin-users__error" role="alert">{{ formError }}</p>
          <div class="admin-users__form-actions">
            <BaseButton type="button" variant="ghost" :disabled="saving" @click="closePanel">取消</BaseButton>
            <BaseButton type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</BaseButton>
          </div>
        </form>
      </aside>
    </div>
  </PageContainer>
</template>

<style scoped>
.admin-users { padding-block: var(--space-8) var(--space-16); }
.admin-users__head, .admin-users__card-head { display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); }
.admin-users__title { font-size:var(--text-2xl); color:var(--color-text); }
.admin-users__desc { margin-top:var(--space-2); color:var(--color-text-muted); font-size:var(--text-sm); }
.admin-users__success, .admin-users__error { margin-top:var(--space-4); padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); font-size:var(--text-sm); }
.admin-users__success { background:color-mix(in srgb, var(--color-success) 10%, transparent); color:var(--color-success); }
.admin-users__error { background:color-mix(in srgb, var(--color-error) 10%, transparent); color:var(--color-error); }
.admin-users__filters { display:flex; flex-wrap:wrap; align-items:end; gap:var(--space-3); margin-top:var(--space-6); padding:var(--space-4); background:var(--color-bg-page); border:1px solid var(--color-border); border-radius:var(--radius-lg); }
.admin-users__filter { display:flex; min-width:190px; flex-direction:column; gap:var(--space-1); color:var(--color-text-muted); font-size:var(--text-xs); }
.admin-users__filter input, .admin-users__filter select, .admin-users__form input, .admin-users__form select { min-height:40px; padding:0 var(--space-3); border:1px solid var(--color-border-strong); border-radius:var(--radius-md); background:var(--color-bg-page); color:var(--color-text); font:inherit; }
.admin-users__filter-actions { display:flex; gap:var(--space-2); }
.admin-users__card { margin-top:var(--space-6); padding:var(--space-5); background:var(--color-bg-page); border:1px solid var(--color-border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); }
.admin-users__card-head h2 { font-size:var(--text-lg); }
.admin-users__count, .admin-users__state, .admin-users__hint { color:var(--color-text-muted); font-size:var(--text-sm); }
.admin-users__state { padding:var(--space-8) 0; text-align:center; }
.admin-users__table-wrap { overflow-x:auto; margin-top:var(--space-4); }
.admin-users__table { width:100%; border-collapse:collapse; font-size:var(--text-sm); }
.admin-users__table th, .admin-users__table td { padding:var(--space-3); border-bottom:1px solid var(--color-border); text-align:left; vertical-align:middle; white-space:nowrap; }
.admin-users__table th { color:var(--color-text-muted); font-size:var(--text-xs); font-weight:700; }
.admin-users__role { display:inline-block; margin:2px var(--space-1) 2px 0; padding:2px var(--space-2); border-radius:var(--radius-full); background:var(--color-primary-light); color:var(--color-primary-dark); font-size:var(--text-xs); }
.admin-users__status { color:var(--color-success); font-weight:600; }
.admin-users__status.is-disabled { color:var(--color-text-muted); }
.admin-users__actions { display:flex; gap:var(--space-1); }
.admin-users__overlay { position:fixed; inset:0; z-index:20; display:flex; justify-content:flex-end; background:rgb(15 23 42 / 35%); }
.admin-users__panel { width:min(440px, 100%); height:100%; overflow:auto; padding:var(--space-6); background:var(--color-bg-page); box-shadow:var(--shadow-lg); }
.admin-users__panel-head { display:flex; align-items:center; justify-content:space-between; }
.admin-users__panel-head h2 { font-size:var(--text-xl); }
.admin-users__close { border:0; background:transparent; color:var(--color-text-muted); font-size:28px; line-height:1; cursor:pointer; }
.admin-users__form { display:flex; flex-direction:column; gap:var(--space-5); margin-top:var(--space-6); }
.admin-users__form > label, .admin-users__form fieldset { display:flex; flex-direction:column; gap:var(--space-2); border:0; padding:0; color:var(--color-text); font-size:var(--text-sm); }
.admin-users__form legend { margin-bottom:var(--space-2); font-weight:600; }
.admin-users__check { display:flex; flex-direction:row !important; align-items:center; gap:var(--space-2); color:var(--color-text-muted); }
.admin-users__form-actions { display:flex; justify-content:flex-end; gap:var(--space-2); padding-top:var(--space-2); }
@media (max-width: 767px) {
  .admin-users__head { align-items:flex-start; flex-direction:column; }
  .admin-users__filter { width:100%; }
  .admin-users__filter-actions { width:100%; }
  .admin-users__filter-actions > * { flex:1; }
  .admin-users__table thead { display:none; }
  .admin-users__table, .admin-users__table tbody, .admin-users__table tr, .admin-users__table td { display:block; width:100%; }
  .admin-users__table tr { padding:var(--space-3) 0; border-bottom:1px solid var(--color-border); }
  .admin-users__table td { display:flex; justify-content:space-between; gap:var(--space-3); padding:var(--space-2) 0; border:0; white-space:normal; }
  .admin-users__table td::before { content:attr(data-label); color:var(--color-text-muted); font-size:var(--text-xs); }
  .admin-users__actions { justify-content:flex-end; }
}
</style>
