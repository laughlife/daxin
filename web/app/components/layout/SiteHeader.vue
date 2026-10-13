<script setup lang="ts">
import { ref } from 'vue'
import { siteConfig } from '~/config/site'

/**
 * 网站 Header：品牌 Logo + 网站名称 + 桌面导航 + CTA + 移动端菜单按钮。
 * sticky 定位在视口顶部；窄屏下隐藏桌面导航与 CTA，只显示品牌与菜单按钮。
 *
 * Logo 优先取后台站点配置的 `site_logo`（图片存入 media_assets，公开接口用 public_url 覆盖取值），
 * 未配置时才回退到前端静态 logo 或文字占位。
 * 配置读取走 useSiteSettings，与页脚/关于我们共用同一份请求。
 */
const mobileNavOpen = ref(false)

function toggleMobileNav() {
  mobileNavOpen.value = !mobileNavOpen.value
}

function closeMobileNav() {
  mobileNavOpen.value = false
}

const { data: settings } = await useSiteSettings()

/** 从配置里取 site_logo；服务端在未配置时回传空串。 */
const logoFromSettings = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

const logoSrc = computed(() => logoFromSettings.value || siteConfig.logo.src)

/**
 * 站点名与副标题改为「后台配置优先、config 兜底」。
 * 当前 logo 已配置，文字块仅在无 logo 时作为占位显示（需求 2026-10-10），
 * 但取值口径仍与页脚保持一致，避免后台改了名称而某处不生效。
 */
const identity = useSiteIdentity()
</script>

<template>
  <header class="site-header">
    <PageContainer class="site-header__inner">
      <NuxtLink to="/" class="site-header__brand" aria-label="返回首页">
        <img
          v-if="logoSrc"
          class="site-header__logo-img"
          :src="logoSrc"
          :alt="siteConfig.logo.alt"
        >
        <!-- 未配置 logo 图片时才回退为文字占位；
             已放 logo 时不再并列显示「大信法务」名称与副标题（需求 2026-10-10）。 -->
        <span v-else class="site-header__logo-text">
          <span class="site-header__name">{{ identity.name }}</span>
          <span class="site-header__subtitle">{{ identity.subtitle }}</span>
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
  height: 44px;
  width: auto;
}

/* 无正式 Logo 时的文字回退（有 logo 时不渲染这一块） */
.site-header__logo-text {
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
  gap: var(--space-1);
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
