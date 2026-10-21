<script setup lang="ts">
import { computed } from 'vue'
import { useSiteSettings } from '~/composables/useSiteSettings'
import { siteThemeCssVariables } from '~/utils/siteTheme'

/**
 * 默认布局：顶部公告栏 + Header + 主内容区（slot） + Footer。
 * 布局仅负责结构组合，具体实现位于 components/layout/ 下的各个组件。
 */
const { data: siteSettings } = await useSiteSettings()
const siteThemeStyle = computed(() => siteThemeCssVariables(siteSettings.value?.settings?.site_theme))

/*
 * 浏览器标签页图标（favicon）：后台「品牌与网站资料 → 浏览器标签页图标」配置。
 * 未配置时不输出 link，保留 nuxt.config 里的默认图标，避免把 favicon 覆盖成空。
 */
const faviconHref = computed(() => String(siteSettings.value?.settings?.site_favicon ?? '').trim())
useHead(() => (
  faviconHref.value
    ? {
        link: [
          // 同时声明 icon 与 shortcut icon：浏览器对快捷图标的优先级更高，
          // 只写 rel=icon 时，内置的 /favicon.ico 会继续生效，标签页看起来没变化。
          { rel: 'icon', type: 'image/png', href: faviconHref.value },
          { rel: 'shortcut icon', href: faviconHref.value },
          { rel: 'apple-touch-icon', href: faviconHref.value },
        ],
      }
    : {}
))
</script>

<template>
  <div class="site-shell" :style="siteThemeStyle">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <SiteAnnouncement />
    <SiteHeader />
    <main id="main-content" class="site-shell__main">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.site-shell {
  --color-primary-dark: color-mix(in srgb, var(--color-primary) 78%, black);
  --color-primary-light: color-mix(in srgb, var(--color-primary) 10%, white);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--color-bg-light);
  background-image: var(--site-background-image);
  background-position: center top;
  background-repeat: repeat-y;
  background-size: 100% auto;
}

.site-shell__main {
  flex: 1;
}

/* 键盘用户跳过公告栏与导航，直达主内容；仅获得焦点时可见 */
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
