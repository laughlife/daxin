<script setup lang="ts">
import { siteConfig } from '~/config/site'
import { consultationCta } from '~/data/mock/home'

/**
 * 首页底部咨询 CTA：24H/7 联系法务团队 + 电话 / 邮箱 / 双微信咨询号
 * + 打开二维码咨询弹窗的按钮（由父级页面控制弹窗）。
 */
const emit = defineEmits<{
  openContact: []
}>()
</script>

<template>
  <section class="consultation-cta" aria-label="底部咨询入口">
    <PageContainer class="consultation-cta__inner">
      <div class="consultation-cta__text">
        <h2 class="consultation-cta__title">{{ consultationCta.title }}</h2>
        <p class="consultation-cta__desc">{{ consultationCta.description }}</p>
        <ul class="consultation-cta__channels">
          <li
            v-for="channel in siteConfig.contact.wechatAccounts"
            :key="channel.id"
          >
            {{ channel.name }}：<strong>{{ channel.wechatId }}</strong>
          </li>
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
        </ul>
      </div>
      <div class="consultation-cta__actions">
        <BaseButton variant="primary" size="lg" @click="emit('openContact')">
          {{ consultationCta.openModalLabel }}
        </BaseButton>
        <BaseButton :to="siteConfig.cta.to" variant="secondary" size="lg" class="consultation-cta__secondary">
          {{ siteConfig.cta.label }}
        </BaseButton>
        <p class="consultation-cta__notice">{{ siteConfig.contact.notice }}</p>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.consultation-cta {
  background-color: var(--color-bg-dark);
  color: var(--color-text-inverse);
}

.consultation-cta__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding-block: var(--space-12);
}

.consultation-cta__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.consultation-cta__title {
  font-size: var(--text-3xl);
  color: var(--color-text-inverse);
}

.consultation-cta__desc {
  max-width: 56ch;
  color: color-mix(in srgb, var(--color-text-inverse) 72%, transparent);
  font-size: var(--text-sm);
}

.consultation-cta__channels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-text-inverse) 72%, transparent);
}

.consultation-cta__channels strong {
  color: var(--color-accent);
}

.consultation-cta__actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-3);
  flex-shrink: 0;
}

/* 深色底上的次按钮：反色描边 */
.consultation-cta .consultation-cta__secondary {
  border-color: color-mix(in srgb, var(--color-text-inverse) 65%, transparent);
  color: var(--color-text-inverse);
}

.consultation-cta .consultation-cta__secondary:hover {
  background-color: color-mix(in srgb, var(--color-text-inverse) 12%, transparent);
  color: var(--color-text-inverse);
}

.consultation-cta__notice {
  font-size: var(--text-xs);
  color: color-mix(in srgb, var(--color-text-inverse) 45%, transparent);
}

@media (max-width: 1023px) {
  .consultation-cta__inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .consultation-cta__actions {
    width: 100%;
  }

  .consultation-cta__actions :deep(.btn) {
    width: 100%;
  }
}

@media (max-width: 639px) {
  .consultation-cta__inner {
    padding-block: var(--space-10);
  }

  .consultation-cta__title {
    font-size: var(--text-2xl);
  }
}
</style>
