<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 企业宣讲图片墙：4 列 × 2 行 = 8 个展示位，多出来的图片横向轮播。
 *
 * 需求（2026-10-20）：
 *   - 布局改成 4*2（4 列 2 行，共 8 个展示位）
 *   - 然后可滚动展示（横向轮播）
 *   - 后台可自行更换图片，支持增删改
 *
 * 实现取舍：
 *   - 一屏只渲染 8 张，避免 14+ 张全部加载与铺开（旧站是全铺开）
 *   - 自动轮播 + 上一页/下一页 + 圆点，键盘可聚焦控制
 *   - 悬停/聚焦时暂停，尊重 prefers-reduced-motion（减少动态偏好下不自动播）
 */
const props = withDefaults(defineProps<{
  images: string[]
  /** 每页展示数量：4 列 × 2 行 */
  pageSize?: number
  /** 自动轮播间隔（毫秒） */
  intervalMs?: number
  alt?: string
}>(), {
  pageSize: 8,
  intervalMs: 5000,
  alt: '大信法务企业宣讲现场',
})

const pageCount = computed(() => Math.max(1, Math.ceil(props.images.length / props.pageSize)))
const current = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

const visible = computed(() => {
  const start = current.value * props.pageSize
  return props.images.slice(start, start + props.pageSize)
})

function go(index: number) {
  if (pageCount.value === 0) return
  current.value = (index + pageCount.value) % pageCount.value
}

function next() { go(current.value + 1) }
function prev() { go(current.value - 1) }

/** 减少动态偏好或只有一页时不启动自动播放。 */
function shouldAutoPlay() {
  if (pageCount.value <= 1) return false
  if (typeof window === 'undefined') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

onMounted(() => {
  if (!shouldAutoPlay()) return
  timer = setInterval(() => {
    if (!paused.value) next()
  }, props.intervalMs)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="presentation-carousel"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <ul class="presentation-carousel__grid">
      <li v-for="(src, index) in visible" :key="`${current}-${index}`">
        <img :src="src" :alt="alt" loading="lazy">
      </li>
    </ul>

    <div v-if="pageCount > 1" class="presentation-carousel__controls">
      <button type="button" aria-label="上一组" @click="prev">‹</button>
      <div class="presentation-carousel__dots" role="tablist" aria-label="企业宣讲图片分组">
        <button
          v-for="index in pageCount"
          :key="index"
          type="button"
          role="tab"
          :class="{ 'is-active': current === index - 1 }"
          :aria-selected="current === index - 1"
          :aria-label="`第 ${index} 组`"
          @click="go(index - 1)"
        />
      </div>
      <button type="button" aria-label="下一组" @click="next">›</button>
    </div>
  </div>
</template>

<style scoped>
.presentation-carousel {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

/* 4 列 × 2 行：固定 8 个展示位，多出的图片靠轮播切换 */
.presentation-carousel__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.presentation-carousel__grid img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.presentation-carousel__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.presentation-carousel__controls > button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-bg-page);
  color: var(--color-text);
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--transition-base), color var(--transition-base);
}

.presentation-carousel__controls > button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.presentation-carousel__dots {
  display: flex;
  gap: var(--space-2);
}

.presentation-carousel__dots button {
  width: 8px;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
  cursor: pointer;
  transition: width var(--transition-base), background-color var(--transition-base);
}

.presentation-carousel__dots button.is-active {
  width: 24px;
  background: var(--color-primary);
}

@media (max-width: 1023px) {
  /* 窄屏放 4 列会挤成小图，改 2 列 × 2 行 = 4 个展示位 */
  .presentation-carousel__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
