<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UserRole } from '~/types/admin'

/**
 * 后台首页（控制台外壳）。
 *
 * - 使用 admin 布局，因此不会渲染公开站点的 Header / Footer；
 * - 通过命名中间件 admin 保证必须登录（未登录跳转登录页）；
 * - 导航按当前角色渲染，无权限的后台栏目以禁用状态展示并给出原因。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '后台管理',
  description: '大信法务后台管理控制台。',
  robots: 'noindex, nofollow'
})

const { user, logout, load } = useAdminSession()

await load()

const loggingOut = ref(false)
const logoutError = ref('')

/** 角色中文名称 */
const ROLE_LABELS: Record<UserRole, string> = {
  admin: '超级管理员',
  editor: '内容编辑',
  viewer: '只读查看'
}

/** 当前角色标签，未知角色原样展示 */
const roleLabels = computed(() =>
  (user.value?.roles ?? []).map((role) => ROLE_LABELS[role] ?? role)
)

function hasRole(...roles: UserRole[]) {
  return roles.some((role) => user.value?.roles.includes(role) ?? false)
}

interface AdminNavItem {
  label: string
  to: string
  description: string
  /** 允许访问的角色 */
  roles: UserRole[]
}

/**
 * 后台导航。
 *
 * 需求（2026-10-10）要求「只保留以下模块」：案例管理、文章管理、律所模块、
 * 图片管理、侧边栏管理、站点设置。
 *
 * 因此品牌管理、媒体库、内容审核、用户与权限**从导航中移除**，
 * 但它们的页面与接口仍然保留（不删除已完成的功能，需要时可直接访问路径恢复）。
 * 如需彻底移除这些模块，请明确告知后另行处理。
 */
const navItems: AdminNavItem[] = [
  { label: '站点设置', to: '/admin/settings', description: '站点基础信息与全局配置', roles: ['admin', 'editor', 'viewer'] },
  { label: '文章管理', to: '/admin/articles', description: '富文本文章与图片发布维护', roles: ['admin', 'editor', 'viewer'] },
  { label: '侧边栏管理', to: '/admin/sidebar', description: '首页侧栏推荐阅读内容维护', roles: ['admin', 'editor', 'viewer'] },
  { label: '案例管理', to: '/admin/cases', description: 'TRO 案件数据的添加与维护', roles: ['admin', 'editor', 'viewer'] },
  { label: '律所管理', to: '/admin/law-firms', description: '代理律所资料与简介维护', roles: ['admin', 'editor', 'viewer'] },
  { label: '图片管理', to: '/admin/images', description: '首页 Banner、团队右侧、业务板块与关于我们配图', roles: ['admin', 'editor', 'viewer'] }
]

const navSections = computed(() =>
  navItems.map((item) => ({
    ...item,
    accessible: hasRole(...item.roles)
  }))
)

async function onLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await logout()
    await navigateTo('/admin/login', { replace: true })
  } catch {
    logoutError.value = '退出登录失败，请稍后重试'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <PageContainer class="admin-home" size="wide">
    <header class="admin-home__head">
      <div>
        <h1 class="admin-home__title">后台管理</h1>
        <p class="admin-home__desc">
          欢迎回来<template v-if="user">，{{ user.displayName }}</template>。请选择需要管理的模块。
        </p>
      </div>

      <div v-if="user" class="admin-home__account">
        <dl class="admin-home__identity">
          <div class="admin-home__identity-row">
            <dt>当前账号</dt>
            <dd>
              <span class="admin-home__name">{{ user.displayName }}</span>
              <span class="admin-home__username">（{{ user.username }}）</span>
            </dd>
          </div>
          <div class="admin-home__identity-row">
            <dt>角色</dt>
            <dd>
              <template v-if="roleLabels.length">
                <span v-for="label in roleLabels" :key="label" class="admin-home__role">
                  {{ label }}
                </span>
              </template>
              <span v-else class="admin-home__username">未分配角色</span>
            </dd>
          </div>
        </dl>
        <BaseButton variant="secondary" size="sm" :disabled="loggingOut" @click="onLogout">
          {{ loggingOut ? '退出中…' : '退出登录' }}
        </BaseButton>
      </div>
    </header>

    <p v-if="logoutError" class="admin-home__error" role="alert">{{ logoutError }}</p>

    <section class="admin-home__section" aria-labelledby="admin-nav-title">
      <h2 id="admin-nav-title" class="admin-home__section-title">管理模块</h2>
      <ul class="admin-home__grid">
        <li v-for="item in navSections" :key="item.to">
          <NuxtLink v-if="item.accessible" class="admin-home__card" :to="item.to">
            <span class="admin-home__card-title">{{ item.label }}</span>
            <span class="admin-home__card-desc">{{ item.description }}</span>
          </NuxtLink>
          <div v-else class="admin-home__card admin-home__card--disabled" aria-disabled="true">
            <span class="admin-home__card-title">{{ item.label }}</span>
            <span class="admin-home__card-desc">{{ item.description }}</span>
            <span class="admin-home__card-lock">当前角色无权访问</span>
          </div>
        </li>
      </ul>
    </section>

    <section class="admin-home__section" aria-labelledby="admin-todo-title">
      <h2 id="admin-todo-title" class="admin-home__section-title">功能状态</h2>
      <BaseCard>
        <p>
          以上栏目为后台框架已预留的入口，具体业务页面（文章、案例、品牌、律所、媒体、审核、用户）
          将陆续上线。当前版本仅提供登录、会话保持与后台导航外壳。
        </p>
      </BaseCard>
    </section>
  </PageContainer>
</template>

<style scoped>
.admin-home {
  padding-block: var(--space-8) var(--space-16);
}

.admin-home__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.admin-home__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-home__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-home__account {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.admin-home__identity {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-home__identity-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.admin-home__identity-row dt {
  min-width: 4.5em;
  color: var(--color-text-muted);
}

.admin-home__identity-row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.admin-home__name {
  font-weight: 700;
  color: var(--color-text);
}

.admin-home__username {
  color: var(--color-text-muted);
}

.admin-home__role {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: var(--text-xs);
  font-weight: 600;
}

.admin-home__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-home__section {
  margin-top: var(--space-8);
}

.admin-home__section-title {
  font-size: var(--text-lg);
  color: var(--color-text);
}

.admin-home__grid {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.admin-home__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-5);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--transition-base),
    border-color var(--transition-base);
}

a.admin-home__card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  text-decoration: none;
}

.admin-home__card--disabled {
  background-color: var(--color-bg-light);
  border-style: dashed;
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.admin-home__card-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}

.admin-home__card--disabled .admin-home__card-title,
.admin-home__card--disabled .admin-home__card-desc {
  color: var(--color-text-muted);
}

.admin-home__card-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-home__card-lock {
  margin-top: auto;
  font-size: var(--text-xs);
  color: var(--color-warning);
}
</style>
