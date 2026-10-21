<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HomeTeamServiceSection } from '~/repositories/home'

/**
 * 首页「核心业务」：01-05 五个流程面板，悬停或点击展开说明和图片。
 * 图标使用现有内联 SVG，保持既定图标不变。
 */
const props = defineProps<{ sections: HomeTeamServiceSection[] }>()

const hoveredIndex = ref(-1)
const selectedIndex = ref(-1)

/** 点击固定优先；再次点击同一项则收起。 */
function toggle(index: number) {
  selectedIndex.value = selectedIndex.value === index ? -1 : index
}

function setHovered(index: number) {
  if (selectedIndex.value < 0) hoveredIndex.value = index
}

function clearHovered(index: number) {
  if (hoveredIndex.value === index) hoveredIndex.value = -1
}

const activeIndex = computed(() => (selectedIndex.value >= 0 ? selectedIndex.value : hoveredIndex.value))

/**
 * 按 slug 取图标路径，而不是 icon_key：
 * 库里 team-ip 与 team-lifecycle 的 icon_key 都是 shield，用 icon_key 会撞图标。
 */
const ICON_PATHS: Record<string, string[]> = {
  'team-tro': [
    'M12 3v18',
    'M5 7h14',
    'M5 7l-2.5 6h5L5 7zm14 0l-2.5 6h5L19 7z',
    'M8 21h8',
  ],
  'team-ip': [
    'M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3z',
    'M9 12l2 2 4-4',
  ],
  'team-disputes': [
    'M4 8h16v11H4z',
    'M9 8V6a3 3 0 016 0v2',
    'M4 13h16',
  ],
  'team-cross-border': [
    'M3 7h11v9H3z',
    'M14 10h4l3 3v3h-7z',
    'M7 19a1.6 1.6 0 100-3.2A1.6 1.6 0 007 19z',
    'M17.5 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z',
  ],
  'team-lifecycle': [
    'M12 21a9 9 0 10-9-9',
    'M12 7v5l3 2',
    'M3 12l-1.5-3M3 12l3-1.5',
  ],
}

const FALLBACK_ICON = ['M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3z']

function iconPaths(slug: string): string[] {
  return ICON_PATHS[slug] ?? FALLBACK_ICON
}
</script>

<template>
  <section
    v-if="sections.length"
    class="core-business"
    aria-label="核心业务"
  >
    <PageContainer>
      <SectionHeading
        align="center"
        eyebrow="CORE BUSINESS"
        title="核心业务"
        description="我们解决哪些问题？"
      />

      <div class="core-business__panels">
        <article
          v-for="(section, index) in sections"
          :key="section.slug"
          class="core-business__panel"
          :class="{
            'core-business__panel--active': activeIndex === index,
            'core-business__panel--pinned': selectedIndex === index,
          }"
          @mouseenter="setHovered(index)"
          @mouseleave="clearHovered(index)"
        >
          <button
            :id="`core-business-toggle-${section.slug}`"
            class="core-business__toggle"
            type="button"
            :aria-expanded="activeIndex === index"
            :aria-controls="`core-business-body-${section.slug}`"
            @click="toggle(index)"
          >
            <span class="core-business__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="core-business__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path v-for="(d, pathIndex) in iconPaths(section.slug)" :key="pathIndex" :d="d" />
              </svg>
            </span>
            <span class="core-business__title">{{ section.title }}</span>
          </button>

          <div
            :id="`core-business-body-${section.slug}`"
            class="core-business__body"
            role="region"
            :aria-labelledby="`core-business-toggle-${section.slug}`"
          >
            <!-- 只有一个 grid 子元素：grid-template-rows: 0fr 只约束第一行 -->
            <div class="core-business__body-inner">
              <p v-if="section.description" class="core-business__summary">{{ section.description }}</p>
              <div class="core-business__detail">
                <ul v-if="section.items.length" class="core-business__items">
                  <li v-for="item in section.items" :key="`${section.slug}-${item.title}`">
                    <span class="core-business__item-title">{{ item.title }}</span>
                    <span v-if="item.description" class="core-business__item-desc">{{ item.description }}</span>
                  </li>
                </ul>
                <div class="core-business__image">
                  <img v-if="section.imageUrl" :src="section.imageUrl" :alt="`${section.title}服务图片`" loading="lazy" decoding="async">
                  <svg v-else viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M8 36l10-11 7 7 6-8 9 12H8Z" />
                    <circle cx="17" cy="16" r="4" />
                    <rect x="5" y="5" width="38" height="38" rx="5" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.core-business {
  padding-block: var(--space-12) var(--space-16);
  background-color: var(--color-bg-light);
}

.core-business__panels {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-8);
  align-items: stretch;
}

.core-business__panel {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-page);
  transition:
    flex-grow var(--transition-base),
    background-color var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base);
}

/* 展开态：变宽 + 换带色底 */
.core-business__panel--active {
  flex-grow: 2.1;
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg-page));
  box-shadow: var(--shadow-md);
}

.core-business__toggle {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-2);
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.core-business__number {
  grid-column: 1 / -1;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 800;
  letter-spacing: .12em;
}

.core-business__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--color-primary);
  transition: transform var(--transition-base), color var(--transition-base);
}

.core-business__icon svg {
  width: 100%;
  height: 100%;
}

.core-business__panel--active .core-business__icon {
  color: var(--color-primary-dark);
  transform: scale(1.06);
}

.core-business__title {
  grid-column: 2;
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: break-word;
}

/*
 * 内容区用 grid-rows 0fr → 1fr 做展开动画，
 * 比 max-height 猜高度稳（内容多少都不需要调魔数）。
 */
.core-business__body {
  display: grid;
  grid-template-rows: 0fr;
  margin-top: 0;
  overflow: hidden;
  transition:
    grid-template-rows var(--transition-base),
    margin-top var(--transition-base),
    opacity var(--transition-base);
  opacity: 0;
}

.core-business__panel--active .core-business__body {
  grid-template-rows: 1fr;
  margin-top: var(--space-4);
  opacity: 1;
}

.core-business__body > * {
  min-height: 0;
}

.core-business__body-inner {
  min-height: 0;
  overflow: hidden;
}

.core-business__summary {
  margin: 0 0 var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 1.65;
}

.core-business__detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(110px, .8fr);
  align-items: start;
  gap: var(--space-4);
}

.core-business__items {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.core-business__items li {
  position: relative;
  display: grid;
  gap: 2px;
  padding-left: var(--space-4);
}

/* 细项使用主题色标记，随站点主色配置变化。 */
.core-business__items li::before {
  content: "";
  position: absolute;
  top: 0.62em;
  left: 0;
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  transform: rotate(45deg);
}

.core-business__item-title {
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.core-business__item-desc {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: 1.6;
}

.core-business__image {
  display: grid;
  min-width: 0;
  overflow: hidden;
  aspect-ratio: 1.25;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-page));
  color: color-mix(in srgb, var(--color-primary) 45%, var(--color-bg-page));
  place-items: center;
}

.core-business__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.core-business__image svg {
  width: 42px;
  height: 42px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 1023px) {
  .core-business__panels {
    flex-direction: column;
  }

  .core-business__panel--active {
    flex-grow: 1;
  }
}

@media (max-width: 640px) {
  .core-business {
    padding-block: var(--space-10) var(--space-12);
  }

  .core-business__title {
    font-size: var(--text-base);
  }

  .core-business__detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .core-business__image {
    max-width: 420px;
  }
}
</style>
