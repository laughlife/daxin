<script setup lang="ts">
import { ref } from 'vue'
import { siteConfig } from '~/config/site'

/**
 * 网站 Footer：公司信息占位 + 业务导航 + 双微信咨询渠道（含二维码占位）
 * + 联系方式 + ICP / 版权 / 隐私政策 / 免责声明占位。
 * 导航与联系方式数据来自 siteConfig，不硬编码。
 */
const { copied, copy } = useCopyText()
const copiedChannelId = ref<string | null>(null)

async function copyWechat(channelId: string, wechatId: string) {
  const ok = await copy(wechatId)
  copiedChannelId.value = ok ? channelId : null
}
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
        <ul class="site-footer__channels">
          <li
            v-for="channel in siteConfig.contact.wechatAccounts"
            :key="channel.id"
            class="site-footer__channel"
          >
            <span class="site-footer__qr" aria-hidden="true">
              <img
                v-if="channel.qrSrc"
                :src="channel.qrSrc"
                :alt="`${channel.name}微信二维码`"
              >
              <template v-else>
                <span class="site-footer__qr-placeholder">二维码<br>待提供</span>
              </template>
            </span>
            <span class="site-footer__channel-info">
              <span class="site-footer__channel-name">{{ channel.name }}</span>
              <span class="site-footer__channel-id">
                微信号：<strong>{{ channel.wechatId }}</strong>
              </span>
              <span class="site-footer__channel-purpose">{{ channel.purpose }}</span>
              <button
                type="button"
                class="site-footer__copy"
                @click="copyWechat(channel.id, channel.wechatId)"
              >
                {{ copied && copiedChannelId === channel.id ? '已复制' : '复制微信号' }}
              </button>
            </span>
          </li>
        </ul>
        <ul class="site-footer__contact-list">
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
          <li>地址：{{ siteConfig.contact.address }}</li>
        </ul>
        <p class="site-footer__notice">{{ siteConfig.contact.notice }}</p>
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
.site-footer__contact-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: rgb(255 255 255 / 65%);
}

/* 微信咨询渠道（含二维码占位） */
.site-footer__channels {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.site-footer__channel {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.site-footer__qr {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border: 1px dashed rgb(255 255 255 / 40%);
  border-radius: var(--radius-md);
  background-color: rgb(255 255 255 / 6%);
  overflow: hidden;
}

.site-footer__qr img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.site-footer__qr-placeholder {
  font-size: var(--text-xs);
  line-height: var(--leading-tight);
  text-align: center;
  color: rgb(255 255 255 / 55%);
}

.site-footer__channel-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.site-footer__channel-name {
  font-weight: 600;
  color: var(--color-text-inverse);
}

.site-footer__channel-id {
  color: rgb(255 255 255 / 65%);
}

.site-footer__channel-id strong {
  color: var(--color-accent);
}

.site-footer__channel-purpose {
  font-size: var(--text-xs);
  color: rgb(255 255 255 / 50%);
}

.site-footer__copy {
  align-self: flex-start;
  margin-top: var(--space-1);
  padding: 2px var(--space-3);
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--color-text-inverse);
  transition: background-color var(--transition-base);
}

.site-footer__copy:hover {
  background-color: rgb(255 255 255 / 15%);
}

.site-footer__notice {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  color: rgb(255 255 255 / 45%);
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
