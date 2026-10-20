<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HomeTeamServiceSection } from '~/repositories/home'

/**
 * 首页「核心业务」：01-05 横向排列，悬停/点击展开对应面板。
 *
 * 需求（2026-10-20）：
 *   - 01-05 横向排列，鼠标悬停/点击时对应面板展开，展示细项与说明文字
 *   - 展开状态与收起状态的背景色要有区分
 *   - 字号不要统一，重点字用金黄色
 *   - 不预留图片位置（明确取消）
 *
 * 交互取舍：悬停只做「预览展开」，点击才「固定展开」。
 * 纯悬停展开在触屏和键盘上不可用，纯点击又会让桌面端多一次操作，
 * 因此两者并存：selectedIndex（点击固定）优先于 hoveredIndex。
 */
const props = defineProps<{ sections: HomeTeamServiceSection[] }>()

const hoveredIndex = ref(-1)
const selectedIndex = ref(-1)

/** 点击固定优先；再次点击同一项则收起。 */
function toggle(index: number) {
  selectedIndex.value = selectedIndex.value === index ? -1 : index
}

function setHovered(index: number) {
  // 已固定其它面板时，悬停不再抢焦点，避免「看哪儿哪儿动」
  if (selectedIndex.value < 0) hoveredIndex.value = index
}

function clearHovered(index: number) {
  if (hoveredIndex.value === index) hoveredIndex.value = -1
}

const activeIndex = computed(() => (selectedIndex.value >= 0 ? selectedIndex.value : hoveredIndex.value))

/** 序号补零：01 ~ 99 */
function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/** 面板数量决定每列基础宽度；数量少时不强行拉满，避免内容被拉散。 */
const panelStyle = computed(() => ({
  '--core-business-count': String(Math.max(props.sections.length, 1)),
}))
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

      <div class="core-business__panels" :style="panelStyle">
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
            <span class="core-business__index" aria-hidden="true">{{ ordinal(index) }}</span>
            <span class="core-business__title">{{ section.title }}</span>
            <span class="core-business__marker" aria-hidden="true">+</span>
          </button>

          <div
            :id="`core-business-body-${section.slug}`"
            class="core-business__body"
            role="region"
            :aria-labelledby="`core-business-toggle-${section.slug}`"
          >
            <!--
              必须只有一个 grid 子元素：grid-template-rows: 0fr 只约束第一行，
              若把 <p> 与 <ul> 直接放进来，第二个会落到自动行，收起时仍占高度
              （实测残留 102px 空白）。
            -->
            <div class="core-business__body-inner">
              <p v-if="section.description" class="core-business__description">{{ section.description }}</p>
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
  /* 面板高度一致，展开时只让内容区滚动，避免整行跳动 */
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

/* 展开态：变宽 + 换成带色底，与收起态形成明确区分 */
.core-business__panel--active {
  flex-grow: 2.1;
  border-color: color-mix(in srgb, var(--color-primary) 42%, transparent);
  background-color: var(--color-primary-light);
  box-shadow: var(--shadow-md);
}

/*
 * 序号在标题上方、纵向排列。
 * 横排时序号 + 标题 + 展开标记三者争宽，像「货代纠纷与劳动争议」这类
 * 9 个字的面板名会被挤到溢出面板边界；纵排后标题拿到整行宽度，稳定不溢出。
 */
.core-business__toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  width: 100%;
  /* 右侧给绝对定位的 +/− 留出位置 */
  padding: 0 var(--space-6) 0 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 序号明显大于标题，形成「字号不要统一」的层次 */
.core-business__index {
  color: var(--color-accent);
  font-size: var(--heading-4);
  font-weight: 800;
  line-height: 1;
}

.core-business__title {
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: break-word;
}

/* 收起时提示可展开；展开后旋转成 ×。绝对定位，不参与标题宽度分配 */
.core-business__marker {
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  color: var(--color-primary);
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1;
  transition: transform var(--transition-base);
}

.core-business__panel--active .core-business__marker {
  transform: rotate(45deg);
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

/* 唯一的内容容器：收起时高度归零，展开时按内容撑开 */
.core-business__body-inner {
  min-height: 0;
  overflow: hidden;
}

.core-business__description {
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 1.7;
}

.core-business__items {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.core-business__items li {
  display: grid;
  gap: 2px;
  padding-left: var(--space-4);
  position: relative;
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

  /* 竖排时展开不再靠宽度变化，改为全部内容可见，避免窄屏反复点 */
  .core-business__panel--active {
    flex-grow: 1;
  }
}

@media (max-width: 640px) {
  .core-business {
    padding-block: var(--space-10) var(--space-12);
  }

  .core-business__index {
    font-size: var(--text-xl);
  }

  .core-business__title {
    font-size: var(--text-base);
  }
}
</style>
