<script setup lang="ts">
/**
 * 合作伙伴三行 LOGO 跑马灯。
 * 三行分别滚动，悬停时暂停；统一椭圆底座并保留 Logo 原色与比例。
 */
const props = defineProps<{ logos: string[] }>()

const hasEmbeddedFrame = (src: string) => src.includes('/d3d1c30a-bb2e-4566-be17-e658cd84c41a.png')

const rows = computed(() => Array.from({ length: 3 }, (_, rowIndex) =>
  props.logos
    .map((src, index) => ({ src, index }))
    .filter(item => item.index % 3 === rowIndex)
))

</script>

<template>
  <div v-if="logos.length" class="partner-marquee" aria-label="合作伙伴">
    <div
      v-for="(row, rowIndex) in rows"
      v-show="row.length"
      :key="rowIndex"
      class="partner-marquee__row"
      :class="{ 'partner-marquee__row--reverse': rowIndex === 1 }"
      :style="{ '--partner-marquee-duration': `${42 + rowIndex * 5}s` }"
    >
      <div class="partner-marquee__track">
        <ul class="partner-marquee__list">
          <li
            v-for="item in row"
            :key="`a-${item.index}`"
          >
            <img :src="item.src" :class="{ 'partner-marquee__logo--framed': hasEmbeddedFrame(item.src) }" alt="" loading="lazy">
          </li>
        </ul>
        <ul class="partner-marquee__list" aria-hidden="true">
          <li
            v-for="item in row"
            :key="`b-${item.index}`"
          >
            <img :src="item.src" :class="{ 'partner-marquee__logo--framed': hasEmbeddedFrame(item.src) }" alt="" loading="lazy">
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.partner-marquee {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-block: var(--space-3);
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent);
}

.partner-marquee__row {
  min-width: 0;
  height: 96px;
  overflow: hidden;
}

.partner-marquee__track {
  display: flex;
  width: max-content;
  animation: partner-marquee-scroll var(--partner-marquee-duration, 42s) linear infinite;
}

.partner-marquee__row--reverse .partner-marquee__track {
  animation-direction: reverse;
}

/* 悬停或键盘聚焦时暂停，便于查看 Logo。 */
.partner-marquee:hover .partner-marquee__track,
.partner-marquee:focus-within .partner-marquee__track {
  animation-play-state: paused;
}

.partner-marquee__list {
  display: flex;
  flex: none;
  align-items: center;
  gap: clamp(28px, 4vw, 64px);
  margin: 0;
  padding: 0 clamp(20px, 3vw, 44px);
  list-style: none;
}

.partner-marquee__list li {
  display: grid;
  flex: none;
  width: clamp(168px, 17vw, 220px);
  height: 80px;
  place-items: center;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 4px 16px rgba(33, 49, 72, 0.06);
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.partner-marquee__list img {
  display: block;
  width: calc(100% - 20px);
  height: 68px;
  object-fit: contain;
  mix-blend-mode: multiply;
  transition: transform 180ms ease;
}

/* 这张合作伙伴图的灰色矩形框属于图片本身，裁掉边缘后与其他 Logo 保持一致。 */
.partner-marquee__list img.partner-marquee__logo--framed {
  clip-path: inset(15% 7% 8% 5%);
}

.partner-marquee__list li:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(33, 49, 72, 0.12);
}

.partner-marquee__list li:hover img {
  transform: scale(1.045);
}

@keyframes partner-marquee-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@media (max-width: 639px) {
  .partner-marquee { gap: var(--space-2); }
  .partner-marquee__row { height: 76px; }
  .partner-marquee__list { gap: 24px; padding-inline: 16px; }
  .partner-marquee__list li { width: 160px; height: 68px; }
  .partner-marquee__list img { width: calc(100% - 16px); height: 56px; }
}

@media (prefers-reduced-motion: reduce) {
  .partner-marquee { overflow: visible; mask-image: none; }
  .partner-marquee__row { height: auto; overflow: visible; }
  .partner-marquee__track { width: 100%; animation: none; }
  .partner-marquee__list { flex-wrap: wrap; justify-content: center; }
  .partner-marquee__list li { height: 62px; }
  .partner-marquee__list[aria-hidden='true'] { display: none; }
}
</style>
