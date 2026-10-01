<script setup lang="ts">
import { homeHero } from '~/data/mock/home'

/**
 * 首页 Hero 首屏。
 * 动效为纯 CSS 背景光效 / 网格 / 缓慢漂浮装饰图形，无外部视频与远程图片；
 * prefers-reduced-motion 时由全局规则自动降级（见 main.css）。
 */
const emit = defineEmits<{
  openContact: []
}>()
</script>

<template>
  <section class="home-hero" aria-label="首屏介绍">
    <div class="home-hero__decor" aria-hidden="true">
      <span class="home-hero__orb home-hero__orb--one" />
      <span class="home-hero__orb home-hero__orb--two" />
      <span class="home-hero__line" />
    </div>
    <PageContainer class="home-hero__inner">
      <p class="home-hero__badge">{{ homeHero.badge }}</p>
      <h1 class="home-hero__title">{{ homeHero.title }}</h1>
      <p class="home-hero__subtitle">{{ homeHero.subtitle }}</p>
      <div class="home-hero__actions">
        <BaseButton :to="homeHero.primaryCta.to" variant="primary" size="lg">
          {{ homeHero.primaryCta.label }}
        </BaseButton>
        <BaseButton variant="secondary" size="lg" class="home-hero__secondary" @click="emit('openContact')">
          {{ homeHero.secondaryCta.label }}
        </BaseButton>
      </div>
      <p class="home-hero__hint">免费初步评估 · 7×24 小时响应 · 跨法域协作</p>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-hero {
  position: relative;
  overflow: hidden;
  background-color: var(--color-bg-dark);
  color: var(--color-text-inverse);
  /* 纯 CSS 网格 + 光效，无远程资源 */
  background-image:
    radial-gradient(
      600px 300px at 15% 20%,
      color-mix(in srgb, var(--color-primary) 30%, transparent),
      transparent 70%
    ),
    radial-gradient(
      500px 260px at 85% 80%,
      color-mix(in srgb, var(--color-accent) 16%, transparent),
      transparent 70%
    ),
    linear-gradient(
      color-mix(in srgb, var(--color-text-inverse) 4%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-text-inverse) 4%, transparent) 1px,
      transparent 1px
    );
  background-size: auto, auto, 48px 48px, 48px 48px;
}

.home-hero__decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.home-hero__orb {
  position: absolute;
  border-radius: var(--radius-full);
  filter: blur(2px);
  opacity: 0.5;
  animation: hero-float 14s ease-in-out infinite alternate;
}

.home-hero__orb--one {
  top: 12%;
  right: 8%;
  width: 180px;
  height: 180px;
  border: 1px solid color-mix(in srgb, var(--color-text-inverse) 25%, transparent);
  background: radial-gradient(
    circle at 30% 30%,
    color-mix(in srgb, var(--color-primary) 38%, transparent),
    transparent 65%
  );
}

.home-hero__orb--two {
  bottom: 10%;
  left: 6%;
  width: 120px;
  height: 120px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 38%, transparent);
  background: radial-gradient(
    circle at 70% 70%,
    color-mix(in srgb, var(--color-accent) 22%, transparent),
    transparent 65%
  );
  animation-delay: -7s;
}

.home-hero__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 62%;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in srgb, var(--color-text-inverse) 18%, transparent) 30%,
    color-mix(in srgb, var(--color-primary) 50%, transparent) 55%,
    transparent
  );
}

@keyframes hero-float {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-24px, 18px, 0);
  }
}

.home-hero__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
  padding-block: var(--space-20) var(--space-16);
}

.home-hero__badge {
  padding: var(--space-1) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-text-inverse) 30%, transparent);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-text-inverse) 85%, transparent);
  background-color: color-mix(in srgb, var(--color-text-inverse) 8%, transparent);
}

.home-hero__title {
  font-size: var(--text-4xl);
  line-height: var(--leading-tight);
  letter-spacing: 0.02em;
}

.home-hero__subtitle {
  max-width: 64ch;
  font-size: var(--text-lg);
  line-height: var(--leading-relaxed);
  color: color-mix(in srgb, var(--color-text-inverse) 78%, transparent);
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

/* 深色底上的次按钮：反色描边 */
.home-hero .home-hero__secondary {
  border-color: color-mix(in srgb, var(--color-text-inverse) 65%, transparent);
  color: var(--color-text-inverse);
}

.home-hero .home-hero__secondary:hover {
  background-color: color-mix(in srgb, var(--color-text-inverse) 12%, transparent);
  color: var(--color-text-inverse);
}

.home-hero__hint {
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-text-inverse) 55%, transparent);
}

/* 移动端：压缩留白，标题仍保持可读字号 */
@media (max-width: 639px) {
  .home-hero__inner {
    padding-block: var(--space-12) var(--space-10);
  }

  .home-hero__title {
    font-size: var(--text-3xl);
  }

  .home-hero__subtitle {
    font-size: var(--text-base);
  }

  .home-hero__actions {
    width: 100%;
    flex-direction: column;
  }

  .home-hero__actions :deep(.btn) {
    width: 100%;
  }

  .home-hero__line {
    display: none;
  }
}
</style>
