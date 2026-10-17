<script setup lang="ts">
import { homeHero } from '~/config/homeContent'

/**
 * 首页 Hero 首屏。
 * 动效为纯 CSS 背景光效 / 网格 / 缓慢漂浮装饰图形，无外部视频与远程图片；
 * prefers-reduced-motion 时关闭背景动画。
 *
 * 文案可由后台「站点设置 → 首页文案」维护：
 * 这里接收父页面传入的值，**未传或为空时回退到 config/homeContent 的静态文案**，
 * 因此既有调用方式（不传 props）与后台改文案两种用法都能工作。
 */
const props = withDefaults(defineProps<{
  badge?: string
  title?: string
  subtitle?: string
  primaryLabel?: string
  primaryLink?: string
  secondaryLabel?: string
}>(), {
  badge: '',
  title: '',
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
  title: props.title?.trim() || homeHero.title,
  subtitle: props.subtitle?.trim() || homeHero.subtitle,
  primaryLabel: props.primaryLabel?.trim() || homeHero.primaryCta.label,
  primaryLink: props.primaryLink?.trim() || homeHero.primaryCta.to,
  secondaryLabel: props.secondaryLabel?.trim() || homeHero.secondaryCta.label,
}))

const titleHighlight = '法律无忧'
const titleParts = computed(() => {
  const index = text.value.title.lastIndexOf(titleHighlight)
  if (index < 0) return null

  return {
    before: text.value.title.slice(0, index),
    highlight: titleHighlight,
    after: text.value.title.slice(index + titleHighlight.length),
  }
})

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
        <template v-if="titleParts">
          <span class="home-hero__title-prefix">{{ titleParts.before }}</span><span class="home-hero__title-highlight">{{ titleParts.highlight }}</span><span>{{ titleParts.after }}</span>
        </template>
        <span v-else>{{ text.title }}</span>
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
  min-height: 520px;
  z-index: 1;
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
  font-size: clamp(36px, 4.2vw, 60px);
  line-height: var(--leading-tight);
  letter-spacing: 0.02em;
  font-weight: 900;
  font-style: italic;
}

.home-hero__title-prefix {
  color: var(--color-text-inverse);
  text-shadow:
    0 2px 0 rgb(5 23 55 / 82%),
    0 0 7px rgb(224 239 255 / 95%),
    0 0 17px rgb(67 147 255 / 95%),
    0 0 29px rgb(35 107 240 / 75%);
}

.home-hero__title-highlight {
  color: #edbf69;
  background-image: linear-gradient(
    110deg,
    #f4d6a0 0%,
    #e5bd7c 12%,
    #b9702c 26%,
    #d29142 36%,
    #fff1ce 45%,
    #fffdf5 50%,
    #fff1ce 55%,
    #c77a2c 68%,
    #b9702c 78%,
    #dfb36f 89%,
    #f2d5a0 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 0.35px rgb(255 236 184 / 72%);
  text-shadow:
    0 1px 0 rgb(255 245 202 / 48%),
    0 2px 0 #88571d,
    0 3px 1px #573515,
    0 0 7px rgb(255 240 199 / 95%),
    0 0 18px rgb(255 177 65 / 86%),
    0 0 30px rgb(242 119 25 / 64%);
}

.home-hero__subtitle {
  max-width: 100%;
  font-size: clamp(18px, 1.6vw, 23px);
  line-height: var(--leading-relaxed);
  color: var(--color-text-inverse);
  text-shadow: 0 1px 5px rgb(0 0 0 / 78%);
  white-space: nowrap;
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

/* 联系按钮用轻透的浅灰衬底，从复杂背景里微微提出来。 */
.home-hero .home-hero__secondary {
  border-color: rgb(235 239 244 / 66%);
  background-color: rgb(235 239 244 / 66%);
  color: #263445;
  backdrop-filter: blur(3px);
  box-shadow: 0 2px 10px rgb(8 20 36 / 12%);
}

.home-hero .home-hero__secondary:hover {
  border-color: rgb(247 249 251 / 74%);
  background-color: rgb(247 249 251 / 74%);
  color: #263445;
}

.home-hero__hint {
  width: fit-content;
  max-width: 100%;
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  color: #263445;
  background-color: rgb(235 239 244 / 66%);
  text-shadow: none;
  backdrop-filter: blur(3px);
  box-shadow: 0 2px 10px rgb(8 20 36 / 12%);
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
    font-size: clamp(30px, 8vw, 38px);
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
