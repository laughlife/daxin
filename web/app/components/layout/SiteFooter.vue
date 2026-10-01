<script setup lang="ts">
import { siteConfig } from '~/config/site'

/**
 * 网站 Footer：公司信息占位 + 业务导航 + 联系方式占位 + 地址占位
 * + ICP / 版权 / 隐私政策 / 免责声明占位。
 * 导航数据来自 siteConfig.footerNav，不硬编码。
 */
</script>

<template>
  <footer class="site-footer">
    <PageContainer class="site-footer__main">
      <div class="site-footer__brand">
        <span class="site-footer__logo" aria-hidden="true">{{ siteConfig.logo.text }}</span>
        <p class="site-footer__name">{{ siteConfig.name }}</p>
        <p class="site-footer__subtitle">{{ siteConfig.subtitle }}</p>
        <BaseButton
          :to="siteConfig.cta.to"
          variant="secondary"
          size="sm"
          class="site-footer__cta"
        >
          {{ siteConfig.cta.label }}
        </BaseButton>
      </div>

      <nav class="site-footer__nav" aria-label="页脚导航">
        <div
          v-for="group in siteConfig.footerNav"
          :key="group.title"
          class="site-footer__nav-group"
        >
          <h3 class="site-footer__nav-title">{{ group.title }}</h3>
          <ul>
            <li v-for="item in group.items" :key="item.label">
              <NuxtLink :to="item.to ?? '/'" class="site-footer__link">
                {{ item.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </nav>

      <div class="site-footer__contact">
        <h3 class="site-footer__nav-title">联系我们</h3>
        <ul>
          <li>{{ siteConfig.contact.wechatLabel }}：{{ siteConfig.contact.wechatId }}</li>
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
          <li>地址：{{ siteConfig.contact.address }}</li>
        </ul>
      </div>
    </PageContainer>

    <div class="site-footer__bottom">
      <PageContainer class="site-footer__bottom-inner">
        <p class="site-footer__legal">
          <span>{{ siteConfig.legal.icp }}</span>
          <span>{{ siteConfig.legal.copyright }}</span>
        </p>
        <p class="site-footer__policies">
          <NuxtLink :to="siteConfig.legal.privacyLink.to ?? '/'" class="site-footer__link">
            {{ siteConfig.legal.privacyLink.label }}
          </NuxtLink>
          <NuxtLink :to="siteConfig.legal.disclaimerLink.to ?? '/'" class="site-footer__link">
            {{ siteConfig.legal.disclaimerLink.label }}
          </NuxtLink>
        </p>
      </PageContainer>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  background-color: var(--color-bg-dark);
  color: var(--color-text-inverse);
  font-size: var(--text-sm);
}

.site-footer__main {
  display: grid;
  grid-template-columns: 1.2fr 2fr 1.2fr;
  gap: var(--space-10);
  padding-block: var(--space-12);
}

.site-footer__brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.site-footer__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-weight: 700;
}

.site-footer__name {
  font-size: var(--text-xl);
  font-weight: 700;
}

.site-footer__subtitle {
  color: rgb(255 255 255 / 65%);
}

.site-footer .site-footer__cta {
  border-color: rgb(255 255 255 / 60%);
  color: var(--color-text-inverse);
}

.site-footer .site-footer__cta:hover {
  background-color: rgb(255 255 255 / 12%);
  color: var(--color-text-inverse);
}

.site-footer__nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-6);
}

.site-footer__nav-title {
  margin-bottom: var(--space-3);
  font-size: var(--text-base);
  color: var(--color-text-inverse);
}

.site-footer__nav ul,
.site-footer__contact ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: rgb(255 255 255 / 65%);
}

.site-footer__link {
  color: rgb(255 255 255 / 65%);
}

.site-footer__link:hover {
  color: var(--color-text-inverse);
}

.site-footer__bottom {
  border-top: 1px solid rgb(255 255 255 / 15%);
  padding-block: var(--space-4);
}

.site-footer__bottom-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  color: rgb(255 255 255 / 55%);
}

.site-footer__legal,
.site-footer__policies {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

/* 平板：品牌与联系方式一行，导航整行 */
@media (max-width: 1023px) {
  .site-footer__main {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-8);
    padding-block: var(--space-10);
  }

  .site-footer__nav {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 移动端：单列堆叠 */
@media (max-width: 639px) {
  .site-footer__main {
    grid-template-columns: 1fr;
    gap: var(--space-8);
  }

  .site-footer__bottom-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
