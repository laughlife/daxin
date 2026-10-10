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
        <!-- 文案为空时不再输出空 span，避免留下无意义的空白文本节点 -->
        <span v-if="siteConfig.announcement.text">{{ siteConfig.announcement.text }}</span>
        <button v-if="defaultChannel" type="button" class="site-announcement__wechat" aria-label="复制 TRO 咨询号 kjzx88" @click="onCopy">
          {{ defaultChannel.name }}：
          <strong>{{ defaultChannel.wechatId }}</strong>
        </button>

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
  display: grid;
  grid-template-columns: minmax(100px, 1fr) auto minmax(100px, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.site-announcement__text {
  grid-column: 2;
  justify-content: center;
  text-align: center;
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
  grid-column: 3;
  justify-self: end;
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
@media (max-width: 1023px) {
  .site-announcement__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .site-announcement__action {
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }

  .site-announcement__feedback {
    white-space: normal;
  }
}
</style>
