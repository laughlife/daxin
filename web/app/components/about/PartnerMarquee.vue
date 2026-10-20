<script setup lang="ts">
/**
 * 合作伙伴 LOGO 跑马灯。
 *
 * 需求（2026-10-20）：
 *   - 删除原来的合作伙伴整体拼图，改为单独的小图标
 *   - 在那个区域滚动轮播（跑马灯）
 *   - 区域不要太高
 *   - 鼠标悬停暂停；LOGO 保持灰度或统一色调，悬停恢复彩色/加深
 *   - 每个 LOGO 单独上传，后台支持更换、添加、删减
 *
 * 实现要点：
 *   - 列表复制一份并整体位移 -50%，形成无缝循环（不必计算单个宽度）
 *   - 悬停暂停用 animation-play-state，避免 JS 计时器抖动
 *   - 整体高度控制在 132px，符合「区域不要太高」
 *   - prefers-reduced-motion 下停掉动画，改为静态换行展示
 */
withDefaults(defineProps<{
  logos: string[]
  /** 每个 logo 的展示边长 */
  size?: number
}>(), {
  size: 76,
})
</script>

<template>
  <div v-if="logos.length" class="partner-marquee" :style="{ '--partner-logo-size': `${size}px` }">
    <div class="partner-marquee__track">
      <!-- 复制一份用于无缝衔接；aria-hidden 避免读屏重复朗读 -->
      <ul class="partner-marquee__list">
        <li v-for="(src, index) in logos" :key="`a-${index}`">
          <img :src="src" alt="" loading="lazy">
        </li>
      </ul>
      <ul class="partner-marquee__list" aria-hidden="true">
        <li v-for="(src, index) in logos" :key="`b-${index}`">
          <img :src="src" alt="" loading="lazy">
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.partner-marquee {
  position: relative;
  margin-top: var(--space-6);
  /* 区域高度受控，不做成大图墙 */
  padding-block: var(--space-3);
  overflow: hidden;
  /* 两端做淡出，滚动时不会硬切 */
  mask-image: linear-gradient(90deg, transparent, black 6%, black 94%, transparent);
}

.partner-marquee__track {
  display: flex;
  width: max-content;
  animation: partner-marquee-scroll 42s linear infinite;
}

/* 悬停或键盘聚焦时暂停，便于看清与点击 */
.partner-marquee:hover .partner-marquee__track,
.partner-marquee:focus-within .partner-marquee__track {
  animation-play-state: paused;
}

.partner-marquee__list {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-5);
  margin: 0;
  padding: 0 var(--space-5);
  list-style: none;
}

.partner-marquee__list li {
  display: grid;
  flex: none;
  width: var(--partner-logo-size);
  height: var(--partner-logo-size);
  place-items: center;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-page);
}

.partner-marquee__list img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* 统一灰度，避免一堆彩色 LOGO 造成视觉杂乱 */
  filter: grayscale(1);
  opacity: .78;
  transition: filter var(--transition-base), opacity var(--transition-base), transform var(--transition-base);
}

/* 悬停恢复彩色并加深 */
.partner-marquee__list li:hover img {
  filter: none;
  opacity: 1;
  transform: scale(1.04);
}

@keyframes partner-marquee-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  /* 减少动态偏好：停止滚动，改为可换行的静态展示 */
  .partner-marquee { overflow: visible; mask-image: none; }
  .partner-marquee__track { animation: none; width: 100%; flex-wrap: wrap; }
  .partner-marquee__list { flex-wrap: wrap; justify-content: center; }
  .partner-marquee__list[aria-hidden='true'] { display: none; }
}
</style>
