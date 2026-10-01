<script setup lang="ts">
import { partnerPlaceholder, serviceCapabilityTags } from '~/data/mock/home'

/**
 * “我们的小伙伴”区域：
 * 正式合作伙伴素材尚未提供，当前以服务能力标签 + 明确的占位说明呈现，
 * 严禁伪造公司 Logo。
 */
</script>

<template>
  <section class="partner-strip" aria-label="服务能力与合作方向">
    <PageContainer>
      <SectionHeading
        align="center"
        :title="partnerPlaceholder.title"
        description="正式合作伙伴 Logo 与介绍素材待提供；以下先以服务能力标签展示我们的协作方向。"
      />
      <ul class="partner-strip__tags">
        <li
          v-for="tag in serviceCapabilityTags"
          :key="tag.id"
          class="partner-strip__tag"
        >
          <span class="partner-strip__tag-label">{{ tag.label }}</span>
          <span class="partner-strip__tag-desc">{{ tag.description }}</span>
        </li>
      </ul>
      <p class="partner-strip__notice" role="note">
        {{ partnerPlaceholder.notice }}
      </p>
    </PageContainer>
  </section>
</template>

<style scoped>
.partner-strip {
  padding-block: var(--space-16);
  background-color: var(--color-bg-page);
}

.partner-strip__tags {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-8);
}

.partner-strip__tag {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-light);
}

.partner-strip__tag-label {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}

.partner-strip__tag-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.partner-strip__notice {
  margin-top: var(--space-6);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

@media (max-width: 1023px) {
  .partner-strip__tags {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639px) {
  .partner-strip {
    padding-block: var(--space-10);
  }

  .partner-strip__tags {
    grid-template-columns: 1fr;
  }
}
</style>
