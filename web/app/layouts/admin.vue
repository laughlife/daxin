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

interface AdminNavLink {
  label: string
  to: string
  roles: UserRole[]
}

interface AdminNavGroup {
  label: string
  links: AdminNavLink[]
}

const groups: AdminNavGroup[] = [
  {
    label: '工作台',
    links: [
      { label: '后台首页', to: '/admin', roles: ['admin', 'editor', 'viewer'] }
    ]
  },
  {
    label: '站点内容',
    links: [
      { label: '站点设置', to: '/admin/settings', roles: ['admin', 'editor', 'viewer'] },
      { label: '团队业务范围', to: '/admin/services', roles: ['admin', 'editor', 'viewer'] },
      { label: '文章管理', to: '/admin/articles', roles: ['admin', 'editor', 'viewer'] },
      { label: '案件管理', to: '/admin/cases', roles: ['admin', 'editor', 'viewer'] },
      { label: '品牌管理', to: '/admin/brands', roles: ['admin', 'editor', 'viewer'] },
      { label: '律所管理', to: '/admin/law-firms', roles: ['admin', 'editor', 'viewer'] },
      { label: '内容审核', to: '/admin/review', roles: ['admin', 'editor', 'viewer'] },
      { label: '媒体资源', to: '/admin/media', roles: ['admin', 'editor', 'viewer'] }
    ]
  },
  {
    label: '账号管理',
    links: [
      { label: '用户与权限', to: '/admin/users', roles: ['admin'] }
    ]
  }
]

const visibleGroups = computed(() => groups
  .map(group => ({
    ...group,
    links: group.links.filter(link => link.roles.some(role => user.value?.roles.includes(role)))
  }))
  .filter(group => group.links.length > 0))

const expandedGroups = ref<string[]>([])
const drawerOpen = ref(false)

function isActive(to: string) {
  return to === '/admin'
    ? route.path === to
    : route.path === to || route.path.startsWith(`${to}/`)
}

function groupIsActive(group: AdminNavGroup) {
  return group.links.some(link => isActive(link.to))
}

function isExpanded(group: AdminNavGroup) {
  return expandedGroups.value.includes(group.label) || groupIsActive(group)
}

function toggleGroup(group: AdminNavGroup) {
  if (groupIsActive(group)) return
  expandedGroups.value = isExpanded(group)
    ? expandedGroups.value.filter(label => label !== group.label)
    : [...expandedGroups.value, group.label]
}

function closeDrawer() {
  drawerOpen.value = false
}

watch(() => route.path, closeDrawer)
</script>

<template>
  <div class="admin-shell" :class="{ 'admin-shell--drawer-open': drawerOpen }">
    <a class="skip-link" href="#admin-main">跳到主要内容</a>

    <header class="admin-mobile-bar">
      <NuxtLink to="/admin" class="admin-shell__brand" aria-label="后台首页">
        <img v-if="logoSrc" class="admin-shell__logo-img" :src="logoSrc" :alt="siteConfig.logo.alt">
        <span v-else class="admin-shell__logo" aria-hidden="true">信</span>
      </NuxtLink>
      <button
        class="admin-shell__drawer-toggle"
        type="button"
        :aria-expanded="drawerOpen"
        aria-controls="admin-sidebar"
        :aria-label="drawerOpen ? '关闭后台菜单' : '打开后台菜单'"
        @click="drawerOpen = !drawerOpen"
      >
        <span aria-hidden="true">{{ drawerOpen ? '×' : '☰' }}</span>
      </button>
    </header>

    <button
      v-if="drawerOpen"
      class="admin-shell__scrim"
      type="button"
      aria-label="关闭后台菜单"
      @click="closeDrawer"
    />

    <aside id="admin-sidebar" class="admin-shell__sidebar" aria-label="后台导航">
      <NuxtLink to="/admin" class="admin-shell__brand admin-shell__sidebar-brand" aria-label="后台首页" @click="closeDrawer">
        <img v-if="logoSrc" class="admin-shell__logo-img" :src="logoSrc" :alt="siteConfig.logo.alt">
        <span v-else class="admin-shell__logo" aria-hidden="true">信</span>
      </NuxtLink>

      <nav class="admin-shell__nav">
        <section v-for="group in visibleGroups" :key="group.label" class="admin-shell__group">
          <button
            v-if="group.links.length > 1"
            class="admin-shell__group-toggle"
            type="button"
            :aria-expanded="isExpanded(group)"
            @click="toggleGroup(group)"
          >
            <span>{{ group.label }}</span>
            <span class="admin-shell__chevron" :class="{ 'admin-shell__chevron--open': isExpanded(group) }" aria-hidden="true">⌄</span>
          </button>
          <p v-else class="admin-shell__group-label">{{ group.label }}</p>

          <ul v-show="group.links.length === 1 || isExpanded(group)" class="admin-shell__links">
            <li v-for="link in group.links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="admin-shell__link"
                :class="{ 'admin-shell__link--active': isActive(link.to) }"
                :aria-current="isActive(link.to) ? 'page' : undefined"
                @click="closeDrawer"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </section>
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

.admin-shell__sidebar {
  position: fixed;
  inset: 0 auto 0 0;
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
  gap: var(--space-5);
  margin-top: var(--space-7);
}

.admin-shell__group { min-width: 0; }

.admin-shell__group-label,
.admin-shell__group-toggle {
  width: 100%;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: .04em;
  text-align: left;
  text-transform: uppercase;
}

.admin-shell__group-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.admin-shell__chevron { transition: transform var(--transition-base); }
.admin-shell__chevron--open { transform: rotate(180deg); }

.admin-shell__links {
  display: grid;
  gap: 3px;
  margin: var(--space-1) 0 0;
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

.admin-shell__main {
  min-width: 0;
  min-height: 100vh;
  margin-left: 248px;
}

.admin-mobile-bar,
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
    width: min(300px, 84vw);
    padding-top: var(--space-4);
    transform: translateX(-105%);
    transition: transform var(--transition-base);
  }

  .admin-shell--drawer-open .admin-shell__sidebar { transform: translateX(0); }
  .admin-shell__sidebar-brand { display: none; }
  .admin-shell__main { margin-left: 0; }

  .admin-shell__scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-header) + 2);
    display: block;
    border: 0;
    background: rgb(18 24 34 / 42%);
  }
}
</style>
