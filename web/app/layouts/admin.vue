<script setup lang="ts">
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
          <span class="admin-shell__logo" aria-hidden="true">信</span>
          <span class="admin-shell__title">大信法务 · 后台管理</span>
        </NuxtLink>
        <NuxtLink to="/" class="admin-shell__back">返回官网首页</NuxtLink>
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
  background-color: var(--color-bg-light);
}

.admin-shell__bar {
  background-color: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.admin-shell__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--header-height);
}

.admin-shell__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text);
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

.admin-shell__title {
  font-size: var(--text-base);
  font-weight: 700;
}

.admin-shell__back {
  font-size: var(--text-sm);
}

.admin-shell__main {
  flex: 1;
}

.skip-link {
  position: absolute;
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
</style>
