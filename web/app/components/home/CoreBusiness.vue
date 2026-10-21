<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HomeTeamServiceSection } from '~/repositories/home'

/**
 * 首页「核心业务」：横向排列的业务面板，悬停/点击展开细项。
 *
 * 需求（2026-10-20）：
 *   - 01-05 横向排列，鼠标悬停/点击时对应面板展开，展示细项
 *
 * 后续调整（用户要求）：
 *   - 去掉 01/02/03 这类序号
 *   - 去掉右侧的「+」标记
 *   - 去掉板块的说明文字（只保留细项）
 *   - 每个板块加一个图标
 *
 * 图标用内联 SVG 而不是素材图：现有 services/*.png 只有 4 个（第 5 个板块没有），
 * 且是红色 3D 图标，与金色主题冲突；内联 SVG 用 currentColor，能跟随主题色。
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
              <ul v-if="section.items.length" class="core-business__items">
                <li v-for="item in section.items" :key="`${section.slug}-${item.title}`">
                  <span class="core-business__item-title">{{ item.title }}</span>
                  <span v-if="item.description" class="core-business__item-desc">{{ item.description }}</span>
                </li>
              </ul>
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
  border: 1px solid var(--color-border);
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
  border-color: color-mix(in srgb, var(--color-primary) 42%, transparent);
  background-color: var(--color-primary-light);
  box-shadow: var(--shadow-md);
}

/* 图标在上、标题在下，纵向排列（去掉序号后不再需要横排挤宽度） */
.core-business__toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 图标跟随主题金色；展开时略微放大 */
.core-business__icon {
  display: grid;
  width: 40px;
  height: 40px;
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

/* 细项用金色小方块做项目符号（装饰，不承载文字信息） */
.core-business__items li::before {
  content: "";
  position: absolute;
  top: 0.62em;
  left: 0;
  width: 6px;
  height: 6px;
  background-color: var(--color-accent);
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
}
</style>
