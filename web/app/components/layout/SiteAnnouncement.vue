<script setup lang="ts">
import { computed } from 'vue'
import { siteConfig } from '~/config/site'

/**
 * 顶部公告栏：咨询引导 + 微信号展示 + 复制按钮。
 * 默认复制渠道由 siteConfig.contact.defaultCopyChannelId 指定（TRO 咨询号 kjzx88）。
 * 复制逻辑复用 useCopyText（纯前端，含 Clipboard API 降级）。
 */
const { copied, failed, copy } = useCopyText()

const defaultChannel = computed(
  () =>
    siteConfig.contact.wechatAccounts.find(
      channel => channel.id === siteConfig.contact.defaultCopyChannelId
    ) ?? siteConfig.contact.wechatAccounts[0]
)

const otherChannels = computed(() =>
  siteConfig.contact.wechatAccounts.filter(
    channel => channel.id !== defaultChannel.value?.id
  )
)

function onCopy() {
  if (defaultChannel.value) {
    void copy(defaultChannel.value.wechatId)
  }
}
</script>

<template>
  <div class="site-announcement">
    <PageContainer class="site-announcement__inner">
      <p class="site-announcement__text">
        <span>{{ siteConfig.announcement.text }}</span>
        <span v-if="defaultChannel" class="site-announcement__wechat">
          {{ defaultChannel.name }}：
          <strong>{{ defaultChannel.wechatId }}</strong>
        </span>
        <span
          v-for="channel in otherChannels"
          :key="channel.id"
          class="site-announcement__wechat"
        >
          {{ channel.name }}：
          <strong>{{ channel.wechatId }}</strong>
        </span>
      </p>
      <div class="site-announcement__action">
        <button
          type="button"
          class="site-announcement__copy"
          @click="onCopy"
        >
          {{ siteConfig.announcement.copyButtonLabel }}
        </button>
        <span class="site-announcement__feedback" role="status" aria-live="polite">
          <template v-if="copied">{{ siteConfig.announcement.copiedLabel }}</template>
          <template v-else-if="failed && defaultChannel">
            {{ siteConfig.announcement.failedLabel }}：{{ defaultChannel.wechatId }}
          </template>
        </span>
      </div>
    </PageContainer>
  </div>
</template>

<style scoped>
.site-announcement {
  background-color: var(--color-bg-dark);
  color: var(--color-text-inverse);
  font-size: var(--text-sm);
}

.site-announcement__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.site-announcement__text {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  min-width: 0;
  color: var(--color-text-inverse);
}

.site-announcement__wechat strong {
  color: var(--color-accent);
}

.site-announcement__action {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.site-announcement__copy {
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--color-text-inverse);
  background: transparent;
  transition: background-color var(--transition-base);
}

.site-announcement__copy:hover {
  background-color: rgb(255 255 255 / 15%);
}

.site-announcement__feedback {
  font-size: var(--text-xs);
  color: var(--color-accent);
  white-space: nowrap;
}

/* 移动端：允许换行，公告文案与操作区上下排列 */
@media (max-width: 639px) {
  .site-announcement__inner {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .site-announcement__action {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .site-announcement__feedback {
    white-space: normal;
  }
}
</style>
