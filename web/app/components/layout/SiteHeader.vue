<script setup lang="ts">
import { ref } from 'vue'
import { siteConfig } from '~/config/site'

/**
 * 网站 Header：Logo 占位 + 网站名称 + 桌面导航 + CTA + 移动端菜单按钮。
 * sticky 定位在视口顶部；窄屏下隐藏桌面导航与 CTA，只显示品牌与菜单按钮。
 */
const mobileNavOpen = ref(false)

function toggleMobileNav() {
  mobileNavOpen.value = !mobileNavOpen.value
}

function closeMobileNav() {
  mobileNavOpen.value = false
}
</script>

<template>
  <header class="site-header">
    <PageContainer class="site-header__inner">
      <NuxtLink to="/" class="site-header__brand" aria-label="返回首页">
        <img
          v-if="siteConfig.logo.src"
          class="site-header__logo-img"
          :src="siteConfig.logo.src"
          :alt="siteConfig.logo.alt"
        >
        <span v-else class="site-header__logo" aria-hidden="true">
          {{ siteConfig.logo.text }}
        </span>
        <span class="site-header__title">
          <span class="site-header__name">{{ siteConfig.name }}</span>
          <span class="site-header__subtitle">{{ siteConfig.subtitle }}</span>
        </span>
      </NuxtLink>

      <DesktopNavigation class="site-header__nav" :items="siteConfig.mainNav" />

      <div class="site-header__actions">
        <BaseButton
          class="site-header__cta"
          :to="siteConfig.cta.to"
          variant="primary"
          size="sm"
        >
          {{ siteConfig.cta.label }}
        </BaseButton>
        <button
          type="button"
          class="site-header__menu-toggle"
          :aria-expanded="mobileNavOpen"
          aria-controls="mobile-navigation"
          :aria-label="mobileNavOpen ? '关闭菜单' : '打开菜单'"
          @click="toggleMobileNav"
        >
          <span class="site-header__menu-icon" aria-hidden="true">
            <span class="site-header__menu-bar" />
            <span class="site-header__menu-bar" />
            <span class="site-header__menu-bar" />
          </span>
        </button>
      </div>
    </PageContainer>

    <MobileNavigation
      id="mobile-navigation"
      :open="mobileNavOpen"
      :items="siteConfig.mainNav"
      @close="closeMobileNav"
    />
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
  background-color: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.site-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--header-height);
}

/* 品牌区 */
.site-header__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  color: var(--color-text);
}

.site-header__brand:hover {
  text-decoration: none;
}

.site-header__logo-img {
  height: 40px;
  width: auto;
}

/* Logo 占位：无正式 Logo 时显示文字块 */
.site-header__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.site-header__title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.site-header__name {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-primary);
  white-space: nowrap;
}

.site-header__subtitle {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-header__nav {
  margin-inline: auto;
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* 移动端菜单按钮：仅在桌面导航隐藏时显示 */
.site-header__menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.site-header__menu-icon {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.site-header__menu-toggle:hover {
  background-color: var(--color-bg-light);
}

.site-header__menu-bar {
  display: block;
  width: 18px;
  height: 2px;
  border-radius: var(--radius-full);
  background-color: var(--color-text);
}

@media (min-width: 1024px) {
  .site-header__menu-toggle {
    display: none;
  }
}

/* 窄屏：隐藏 CTA（移动端抽屉底部仍有入口），压缩副标题 */
@media (max-width: 639px) {
  .site-header__cta {
    display: none;
  }

  .site-header__subtitle {
    display: none;
  }
}
</style>
