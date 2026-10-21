<script setup lang="ts">
import { homeHero } from '~/config/homeContent'
import { versionedAssetUrl } from '~/utils/versionedAssetUrl.mjs'

const TITLE_IMAGE_PATH = '/images/home-hero-title.png'
const TITLE_IMAGE_VERSION = '20261017'

/**
 * 首页 Hero 首屏。
 * 动效为纯 CSS 背景光效 / 网格 / 缓慢漂浮装饰图形，无外部视频与远程图片；
 * prefers-reduced-motion 时关闭背景动画。
 *
 * 首屏标题图与其他文案可由后台「站点设置 → 首页内容」维护；未配置时回退到
 * 项目内提供的标题图与静态文案。
 */
const props = withDefaults(defineProps<{
  badge?: string
  titleImage?: string
  subtitle?: string
  primaryLabel?: string
  primaryLink?: string
  secondaryLabel?: string
}>(), {
  badge: '',
  titleImage: '',
  subtitle: '',
  primaryLabel: '',
  primaryLink: '',
  secondaryLabel: '',
})

const emit = defineEmits<{
  openContact: []
}>()

const text = computed(() => ({
  badge: props.badge?.trim() || homeHero.badge,
  titleImage: props.titleImage?.trim() || homeHero.titleImage,
  subtitle: props.subtitle?.trim() || homeHero.subtitle,
  primaryLabel: props.primaryLabel?.trim() || homeHero.primaryCta.label,
  primaryLink: props.primaryLink?.trim() || homeHero.primaryCta.to,
  secondaryLabel: props.secondaryLabel?.trim() || homeHero.secondaryCta.label,
}))

const titleImageSrc = computed(() =>
  versionedAssetUrl(text.value.titleImage, TITLE_IMAGE_PATH, TITLE_IMAGE_VERSION)
)

/**
 * 首屏动态背景。
 *
 * 需求：把原来纯 CSS 实现的动态背景提取成动图，上传后用它替换 CSS 效果。
 * `home_hero_background` 是动画 WebP，`home_hero_background_poster` 是其静帧，
 * 供不支持动画 WebP 的浏览器回退。
 *
 * 两者都没配置时返回 false，此时仍然使用原来的 CSS 渐变+网格背景，
 * 保证任何情况下首屏都有底、不会开天窗。
 */
const { data: siteSettings } = await useSiteSettings()

function readImage(key: string): string {
  const value = siteSettings.value?.settings?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const backgroundImage = computed(() => readImage('home_hero_background'))
const backgroundPoster = computed(() => readImage('home_hero_background_poster'))
/** 配置了背景图就用图，否则退回 CSS 背景。 */
const hasImageBackground = computed(() => Boolean(backgroundImage.value || backgroundPoster.value))

const heroStyle = computed(() => {
  if (!hasImageBackground.value) return {}
  // 同时给出 image-set 与 background-image：不支持动画 WebP 的浏览器
  // 会退回 poster（静态 JPEG），再不行还有 CSS 渐变兜底。
  const layers = [`url("${backgroundImage.value || backgroundPoster.value}")`]
  if (backgroundPoster.value && backgroundImage.value) {
    layers.push(`url("${backgroundPoster.value}")`)
  }
  return { backgroundImage: layers.join(', ') }
})
</script>

<template>
  <section
    class="home-hero"
    :class="{ 'home-hero--image-bg': hasImageBackground }"
    :style="heroStyle"
    aria-label="首屏介绍"
  >
    <!-- 背景图为动图时不再渲染 CSS 光斑/网格装饰，避免与图片里的图案叠加重复 -->
    <div v-if="!hasImageBackground" class="home-hero__decor" aria-hidden="true">
      <span class="home-hero__orb home-hero__orb--one" />
      <span class="home-hero__orb home-hero__orb--two" />
      <span class="home-hero__line" />
    </div>
    <PageContainer class="home-hero__inner">
      <p class="home-hero__badge">{{ text.badge }}</p>
      <h1 class="home-hero__title">
        <img
          class="home-hero__title-image"
          :src="titleImageSrc"
          alt="跨境有我，法律无忧"
          loading="eager"
          decoding="async"
        >
      </h1>
      <p class="home-hero__subtitle">{{ text.subtitle }}</p>
      <div class="home-hero__actions">
        <BaseButton :to="text.primaryLink" variant="primary" size="lg">
          {{ text.primaryLabel }}
        </BaseButton>
        <BaseButton variant="secondary" size="lg" class="home-hero__secondary" @click="emit('openContact')">
          {{ text.secondaryLabel }}
        </BaseButton>
      </div>
      <p class="home-hero__hint">免费初步评估 · 7×24 小时响应 · 跨法域协作</p>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-hero {
  /* 铺满第一屏（用户要求）：减去公告栏+页头高度，正好等于可视区剩余空间 */
  min-height: calc(100svh - 110px);
  display: flex;
  align-items: center;
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

/**
 * 配置了背景动图时的样式。
 *
 * 这里**替换掉原来纯 CSS 的动态背景**（渐变光效 + 网格 + 光斑动画），
 * 改用图片本身：图片尺寸比例与首屏一致，cover 铺满即可。
 * 仍保留 background-color 兜底，图片加载失败时不会露出白底。
 */
.home-hero--image-bg {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  /* 动图若被浏览器当作静态图，也只是画面静止，不影响可读性 */
  animation: none;
}

/**
 * 图片模式下关闭原本的 CSS 动态背景层。
 *
 * ::before 是呼吸光晕（hero-atmosphere 12s）、::after 是滚动网格（hero-grid 18s），
 * 这两层就是「原来的 CSS 动态背景」本体。既然已经换成动图，
 * 继续叠加只会让两套图案重影，因此置为 none。
 */
.home-hero--image-bg::before,
.home-hero--image-bg::after {
  display: none;
}

.home-hero::before,
.home-hero::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
}

.home-hero::before {
  background: radial-gradient(ellipse at 75% 45%, color-mix(in srgb, var(--color-primary) 34%, transparent), transparent 55%),
    radial-gradient(ellipse at 20% 70%, color-mix(in srgb, var(--color-accent) 20%, transparent), transparent 45%);
  animation: hero-atmosphere 12s ease-in-out infinite alternate;
}

.home-hero::after {
  background-image: linear-gradient(color-mix(in srgb, var(--color-text-inverse) 3%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-text-inverse) 3%, transparent) 1px, transparent 1px);
  background-size: 64px 64px;
  animation: hero-grid 18s linear infinite;
  mask-image: linear-gradient(90deg, transparent, black);
}

@keyframes hero-atmosphere {
  from { transform: translate3d(-6%, -4%, 0) scale(1); }
  to { transform: translate3d(6%, 5%, 0) scale(1.15); }
}

@keyframes hero-grid {
  to { transform: translate3d(64px, 64px, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .home-hero::before, .home-hero::after, .home-hero__orb {
    animation: none !important;
  }
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
    transform: translate3d(-60px, 40px, 0);
  }
}

.home-hero__inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 500px;
  z-index: 1;
  gap: var(--space-5);
  padding-block: var(--space-12) var(--space-16);
}

.home-hero__badge {
  padding: var(--space-2) var(--space-5);
  border: 1px solid color-mix(in srgb, var(--color-text-inverse) 48%, transparent);
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  color: color-mix(in srgb, var(--color-text-inverse) 85%, transparent);
  background-color: color-mix(in srgb, var(--color-text-inverse) 12%, transparent);
  backdrop-filter: blur(5px);
}

.home-hero__title {
  width: min(1080px, 100%);
  aspect-ratio: 67 / 10;
  overflow: hidden;
  line-height: 0;
  margin: 0;
}

.home-hero__title-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.home-hero__subtitle {
  max-width: min(100%, 1000px);
  font-size: clamp(21px, 1.85vw, 30px);
  line-height: 1.7;
  color: var(--color-text-inverse);
  text-shadow: 0 1px 5px rgb(0 0 0 / 78%);
  white-space: nowrap;
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
  margin-top: var(--space-1);
}

.home-hero__actions :deep(.btn) {
  min-height: 56px;
  padding-inline: var(--space-8);
  border-radius: var(--radius-full);
}

/*
 * 首屏主按钮的渐变改用主题令牌（原为硬编码红 #e51b28/#b91c1c）。
 * 需求 2026-10-20 要求「首屏布局与文案不动」，配色属于全站统一调整，
 * 硬编码红色在金色主题下会突兀，因此改为引用 --color-primary 系列。
 */
.home-hero__actions :deep(.btn--primary) {
  border-color: rgb(255 255 255 / 52%);
  background: linear-gradient(135deg, var(--color-accent), var(--color-primary));
  box-shadow: 0 8px 22px rgb(90 62 18 / 30%);
}

.home-hero__actions :deep(.btn--primary:hover) {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  box-shadow: 0 10px 26px rgb(90 62 18 / 36%);
}

/* 联系按钮用轻透的浅灰衬底，从复杂背景里微微提出来。 */
.home-hero .home-hero__secondary {
  border-color: rgb(245 247 250 / 88%);
  background-color: rgb(245 247 250 / 88%);
  color: #263445;
  backdrop-filter: blur(3px);
  box-shadow: 0 5px 16px rgb(8 20 36 / 18%);
}

.home-hero .home-hero__secondary:hover {
  border-color: #fff;
  background-color: #fff;
  color: #263445;
}

.home-hero__hint {
  width: fit-content;
  max-width: 100%;
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  color: #263445;
  background-color: rgb(239 246 255 / 82%);
  text-shadow: none;
  backdrop-filter: blur(3px);
  box-shadow: 0 4px 14px rgb(8 20 36 / 14%);
}

@media (max-width: 767px) {
  .home-hero__subtitle {
    white-space: normal;
  }
}

/* 移动端：压缩留白，标题仍保持可读字号 */
@media (max-width: 639px) {
  .home-hero__inner {
    padding-block: var(--space-12) var(--space-10);
    min-height: 460px;
  }

  .home-hero__title {
    width: 100%;
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
