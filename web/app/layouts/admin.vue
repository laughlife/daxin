<script setup lang="ts">
import { computed } from 'vue'
import { siteConfig } from '~/config/site'

const route = useRoute()
const showAdminHomeLink = computed(() => route.path !== '/admin')
const { data: settings } = await useSiteSettings()
const logoSrc = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : siteConfig.logo.src
})
/**
 * 后台专用布局：只保留最小的后台壳层（品牌栏 + 主内容区）。
 *
 * 后台页面通过 definePageMeta({ layout: 'admin' }) 使用本布局，
 * 从而完全绕开 layouts/default.vue 中的站点公告栏、SiteHeader 与 SiteFooter，
 * 避免后台被公开站点导航干扰；公开页面仍使用默认布局，行为不变。
 */
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#admin-main">跳到主要内容</a>
    <header class="admin-shell__bar">
      <PageContainer class="admin-shell__inner" size="wide">
        <NuxtLink to="/admin" class="admin-shell__brand">
          <img v-if="logoSrc" class="admin-shell__logo-img" :src="logoSrc" :alt="siteConfig.logo.alt">
          <span v-else class="admin-shell__logo" aria-hidden="true">信</span>
        </NuxtLink>
        <div class="admin-shell__actions">
          <NuxtLink v-if="showAdminHomeLink" to="/admin" class="admin-shell__home">
            返回后台首页
          </NuxtLink>
          <NuxtLink to="/" class="admin-shell__home">返回官网首页</NuxtLink>
        </div>
      </PageContainer>
    </header>

    <main id="admin-main" class="admin-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-top: var(--header-height);
  background-color: var(--color-bg-light);
}

.admin-shell__bar {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-header);
  background-color: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.admin-shell__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--header-height);
}

.admin-shell__home {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  box-shadow: var(--shadow-sm);
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
}

.admin-shell__home:hover {
  background-color: var(--color-primary-light);
  text-decoration: none;
}

.admin-shell__home:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.admin-shell__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text);
  margin-right: auto;
}

.admin-shell__brand:hover {
  text-decoration: none;
}

.admin-shell__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.admin-shell__logo-img {
  display: block;
  width: auto;
  height: 40px;
  max-width: 180px;
  object-fit: contain;
}

.admin-shell__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.admin-shell__actions .admin-shell__home {
  line-height: 1.2;
}

.admin-shell__main {
  flex: 1;
}

.skip-link {
  position: fixed;
  top: -100px;
  left: var(--space-4);
  z-index: calc(var(--z-mobile-panel) + 1);
  padding: var(--space-2) var(--space-4);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: top var(--transition-base);
}

.skip-link:focus-visible {
  top: 0;
  outline-color: var(--color-text-inverse);
}

@media (max-width: 767px) {
  .admin-shell__inner { gap: var(--space-2); }
}
</style>
