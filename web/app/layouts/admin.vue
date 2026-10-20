<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UserRole } from '~/types/admin'
import { siteConfig } from '~/config/site'

const route = useRoute()
const { user } = useAdminSession()
const { data: settings } = await useSiteSettings()
const logoSrc = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : siteConfig.logo.src
})

interface AdminNavItem {
  label: string
  to: string
  roles: UserRole[]
}

const menuItems: AdminNavItem[] = [
  { label: '案件管理', to: '/admin/cases', roles: ['admin', 'editor', 'viewer'] },
  { label: '产品侵权检测', to: '/admin/infringement-checks', roles: ['admin'] },
  { label: '品牌管理', to: '/admin/brands', roles: ['admin', 'editor', 'viewer'] },
  { label: '律所管理', to: '/admin/law-firms', roles: ['admin', 'editor', 'viewer'] },
  { label: '用户与权限', to: '/admin/users', roles: ['admin'] },
  { label: '站点设置', to: '/admin/settings', roles: ['admin', 'editor', 'viewer'] }
]

const visibleMenuItems = computed(() => menuItems.filter(item => item.roles.some(role => user.value?.roles.includes(role))))
const drawerOpen = ref(false)
const loggingOut = ref(false)
const logoutError = ref('')
const roleLabels = computed(() => {
  const labels: Record<UserRole, string> = {
    admin: '超级管理员',
    editor: '内容编辑',
    viewer: '只读查看'
  }
  return (user.value?.roles ?? []).map(role => labels[role] ?? role)
})
const { logout } = useAdminSession()

function isActive(to: string) {
  return to === '/admin'
    ? route.path === to
    : route.path === to || route.path.startsWith(`${to}/`)
}

function closeDrawer() {
  drawerOpen.value = false
}

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

watch(() => route.path, closeDrawer)
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--drawer-open': drawerOpen }">
    <a class="skip-link" href="#admin-main">跳到主要内容</a>

    <header class="admin-shell__topbar">
      <NuxtLink to="/admin/settings" class="admin-shell__brand" aria-label="站点设置">
        <img v-if="logoSrc" class="admin-shell__logo-img" :src="logoSrc" :alt="siteConfig.logo.alt">
        <span v-else class="admin-shell__logo" aria-hidden="true">信</span>
      </NuxtLink>
      <!--
        账号与角色位于 Logo 右侧并横向排列；退出按钮单独放在最右。
      -->
      <div v-if="user" class="admin-shell__account" aria-label="当前账号信息">
        <span class="admin-shell__identity admin-shell__identity--account"><strong class="admin-shell__account-label">当前账号：</strong>{{ user.displayName }}（{{ user.username }}）</span>
        <span class="admin-shell__identity admin-shell__identity--role"><strong class="admin-shell__account-label">角色：</strong>{{ roleLabels.join('、') || '未分配角色' }}</span>
      </div>
      <button class="admin-shell__logout" type="button" :disabled="loggingOut" @click="onLogout">
        {{ loggingOut ? '退出中…' : '退出登录' }}
      </button>
      <button
        class="admin-shell__drawer-toggle"
        type="button"
        :aria-expanded="drawerOpen"
        aria-controls="admin-sidebar"
        :aria-label="drawerOpen ? '关闭菜单' : '打开菜单'"
        @click="drawerOpen = !drawerOpen"
      >
        <span aria-hidden="true">{{ drawerOpen ? '×' : '☰' }}</span>
      </button>
    </header>

    <p v-if="logoutError" class="admin-shell__error" role="alert">{{ logoutError }}</p>

    <button
      v-if="drawerOpen"
      class="admin-shell__scrim"
      type="button"
      aria-label="关闭后台菜单"
      @click="closeDrawer"
    />

    <aside id="admin-sidebar" class="admin-shell__sidebar" aria-label="导航菜单">
      <nav class="admin-shell__nav">
        <NuxtLink
          v-for="item in visibleMenuItems"
          :key="item.to"
          :to="item.to"
          class="admin-shell__link"
          :class="{ 'admin-shell__link--active': isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          @click="closeDrawer"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <main id="admin-main" class="admin-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
  background: var(--color-bg-light);
}

.admin-shell__topbar {
  position: sticky;
  top: 0;
  z-index: calc(var(--z-header) + 1);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-5);
  min-height: 72px;
  padding: var(--space-3) var(--space-6);
  background: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
}

.admin-shell__sidebar {
  position: fixed;
  inset: 72px auto 0 0;
  z-index: var(--z-header);
  display: flex;
  flex-direction: column;
  width: 248px;
  padding: var(--space-5) var(--space-3);
  overflow-y: auto;
  background: var(--color-bg-page);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.admin-shell__brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  color: var(--color-text);
}

.admin-shell__brand:hover { text-decoration: none; }

.admin-shell__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.admin-shell__logo-img {
  display: block;
  width: auto;
  height: 42px;
  max-width: 200px;
  object-fit: contain;
}

.admin-shell__nav {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-5);
  padding: 0;
  list-style: none;
}

.admin-shell__link {
  display: block;
  padding: 10px var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 550;
  transition: color var(--transition-base), background-color var(--transition-base);
}

.admin-shell__link:hover,
.admin-shell__link--active {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  text-decoration: none;
}

.admin-shell__account {
  display: flex;
  flex-direction: row;
  align-items: center;
  /* 账号区与 Logo 保持间距，不额外添加竖向分隔线。 */
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: var(--space-4);
  min-width: 0;
  margin-left: var(--space-8);
}
.admin-shell__identity {
  color: var(--color-text);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.admin-shell__account-label { color: var(--color-text); font-size: inherit; font-weight: 700; }

/*
 * 退出按钮：做成可见的按钮样式（描边 + 内边距），并推到最右。
 * margin-left: auto 把剩余空间都吃掉，因此它总是贴右，
 * 中间的账号信息与它之间的空白由弹性布局自动分配。
 */
.admin-shell__logout {
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 42px;
  padding: var(--space-2) var(--space-5);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-control);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-base), color var(--transition-base), background-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
}
.admin-shell__logout:hover:not(:disabled) {
  border-color: var(--color-primary-dark);
  color: var(--color-text-on-primary);
  background: var(--color-primary-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.admin-shell__logout:disabled { opacity: .55; cursor: not-allowed; }
.admin-shell__error { margin: var(--space-2) var(--space-6); color: var(--color-error); font-size: var(--text-sm); }

.admin-shell__main {
  min-width: 0;
  min-height: 100vh;
  margin-left: 248px;
}

:deep(.admin-settings__field),
:deep(.admin-services__cell),
:deep(.admin-articles__field:not(.admin-articles__field--check)),
:deep(.admin-cases__field),
:deep(.admin-entity__field),
:deep(.admin-review__field),
:deep(.admin-media__field),
:deep(.admin-login__field),
:deep(.admin-users__form > label) {
  display: grid;
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  align-items: start;
  column-gap: var(--space-4);
  row-gap: var(--space-2);
}

:deep(.admin-settings__field-head),
:deep(.admin-articles__field > label),
:deep(.admin-cases__field > label),
:deep(.admin-entity__field > label),
:deep(.admin-review__field > label),
:deep(.admin-media__field > label),
:deep(.admin-login__field > label),
:deep(.admin-users__form > label > span) {
  grid-column: 1;
  align-self: center;
}

:deep(.admin-settings__field > :not(.admin-settings__field-head)),
:deep(.admin-services__cell > :not(label)),
:deep(.admin-articles__field > :not(label)),
:deep(.admin-cases__field > :not(label)),
:deep(.admin-entity__field > :not(label)),
:deep(.admin-review__field > :not(label)),
:deep(.admin-media__field > :not(label)),
:deep(.admin-login__field > :not(label)),
:deep(.admin-users__form > label > :not(span)) {
  grid-column: 2;
  min-width: 0;
  max-width: 100%;
}

:deep(textarea) {
  field-sizing: content;
  min-height: 5rem;
  max-height: none !important;
  overflow-y: hidden !important;
}

:deep(.admin-rte__body) {
  max-height: none;
  overflow: visible;
}

.admin-shell__scrim { display: none; }

.skip-link {
  position: fixed;
  top: -100px;
  left: var(--space-4);
  z-index: calc(var(--z-mobile-panel) + 1);
  padding: var(--space-2) var(--space-4);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: top var(--transition-base);
}

.skip-link:focus-visible { top: 0; }

@media (max-width: 767px) {
  .admin-mobile-bar {
    position: sticky;
    inset: 0 0 auto;
    z-index: calc(var(--z-header) + 1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 0 var(--space-4);
    background: var(--color-bg-page);
    border-bottom: 1px solid var(--color-border);
  }

  .admin-shell__drawer-toggle {
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-page);
    color: var(--color-text);
    font-size: 22px;
    cursor: pointer;
  }

  .admin-shell__sidebar {
    z-index: calc(var(--z-header) + 3);
    inset: 64px auto 0 0;
    width: min(300px, 84vw);
    padding-top: var(--space-4);
    transform: translateX(-105%);
    transition: transform var(--transition-base);
  }

  .admin-shell--drawer-open .admin-shell__sidebar { transform: translateX(0); }
  .admin-shell__main { margin-left: 0; }

  .admin-shell__topbar { min-height: 64px; gap: var(--space-2); padding-inline: var(--space-3); }
  .admin-shell__brand { justify-content: flex-start; min-width: 0; }
  .admin-shell__logo-img { max-width: 116px; height: 34px; }
  .admin-shell__account { flex: 1 1 auto; gap: var(--space-2); justify-content: flex-start; margin-left: var(--space-3); }
  .admin-shell__identity { font-size: 11px; }
  .admin-shell__logout { min-height: 38px; padding: var(--space-1) var(--space-3); font-size: 11px; white-space: nowrap; }
  .admin-shell__drawer-toggle { flex: 0 0 auto; }

  :deep(.admin-settings__field),
  :deep(.admin-services__cell),
  :deep(.admin-articles__field:not(.admin-articles__field--check)),
  :deep(.admin-cases__field),
  :deep(.admin-entity__field),
  :deep(.admin-review__field),
  :deep(.admin-media__field),
  :deep(.admin-login__field),
  :deep(.admin-users__form > label) {
    grid-template-columns: 1fr;
  }

  :deep(.admin-settings__field-head),
  :deep(.admin-settings__field > :not(.admin-settings__field-head)),
  :deep(.admin-services__cell > *),
  :deep(.admin-articles__field > *),
  :deep(.admin-cases__field > *),
  :deep(.admin-entity__field > *),
  :deep(.admin-review__field > *),
  :deep(.admin-media__field > *),
  :deep(.admin-login__field > *),
  :deep(.admin-users__form > label > *) {
    grid-column: 1;
  }

  .admin-shell__scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-header) + 2);
    display: block;
    border: 0;
    background: rgb(18 24 34 / 42%);
  }
}

@media (max-width: 460px) {
  /*
   * 窄屏（手机）时账号信息允许换行到第二行，但退出按钮仍与抽屉按钮同排靠右。
   * 用 order 明确顺序：品牌(0) → 退出(1) → 抽屉(2) → 账号(3)。
   */
  .admin-shell__topbar { flex-wrap: wrap; }
  .admin-shell__account {
    flex-basis: 100%;
    order: 3;
    justify-content: flex-start;
    /* 换行后独占一行，不再需要抢占右侧空间 */
    margin-left: 0;
    padding-left: 0;
  }
  .admin-shell__logout { order: 1; margin-left: auto; }
  .admin-shell__drawer-toggle { order: 2; margin-left: var(--space-2); }
}
</style>
