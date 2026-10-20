<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CoreAdvantage } from '~/repositories/home'

const props = defineProps<{
  items: CoreAdvantage[]
}>()

const hoveredIndex = ref(-1)
const selectedIndex = ref(-1)
const compactLayout = ref(false)
const expandedIndex = computed(() => selectedIndex.value >= 0 ? selectedIndex.value : hoveredIndex.value)
const gridTemplateColumns = computed(() => {
  const columns = Math.min(compactLayout.value ? 2 : 4, props.items.length)
  if (columns === 0) return ''
  if (expandedIndex.value < 0) return `repeat(${columns}, minmax(0, 1fr))`
  const activeColumn = compactLayout.value ? expandedIndex.value % columns : expandedIndex.value
  return Array.from({ length: columns }, (_, index) => index === activeColumn ? '2fr' : '1fr').join(' ')
})
let layoutQuery: MediaQueryList | undefined

function updateLayout() {
  compactLayout.value = layoutQuery?.matches ?? false
}

onMounted(() => {
  layoutQuery = window.matchMedia('(max-width: 1023px)')
  updateLayout()
  layoutQuery.addEventListener('change', updateLayout)
})

onBeforeUnmount(() => layoutQuery?.removeEventListener('change', updateLayout))

function toggle(index: number) {
  if (selectedIndex.value === index) {
    selectedIndex.value = -1
    hoveredIndex.value = -1
  } else {
    selectedIndex.value = index
    hoveredIndex.value = -1
  }
}

function setHovered(index: number) {
  if (selectedIndex.value < 0) hoveredIndex.value = index
}

function clearHovered(index: number) {
  if (hoveredIndex.value === index) hoveredIndex.value = -1
}

function iconKey(title: string) {
  if (title.includes('专业')) return 'team'
  if (title.includes('经验')) return 'experience'
  if (title.includes('高效')) return 'efficiency'
  return 'protection'
}

function displayTitle(title: string) {
  return title.replace(/^0?[1-4][.、\s]+/, '').trim()
}

function segments(item: CoreAdvantage) {
  const text = item.description
  const highlights = [...new Set(item.highlights.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!text || highlights.length === 0) return [{ text, emphasis: false }]

  const result: Array<{ text: string, emphasis: boolean }> = []
  let cursor = 0
  while (cursor < text.length) {
    let matchIndex = -1
    let match = ''
    for (const candidate of highlights) {
      const index = text.indexOf(candidate, cursor)
      if (index !== -1 && (matchIndex === -1 || index < matchIndex || (index === matchIndex && candidate.length > match.length))) {
        matchIndex = index
        match = candidate
      }
    }
    if (matchIndex === -1) {
      result.push({ text: text.slice(cursor), emphasis: false })
      break
    }
    if (matchIndex > cursor) result.push({ text: text.slice(cursor, matchIndex), emphasis: false })
    result.push({ text: match, emphasis: true })
    cursor = matchIndex + match.length
  }
  return result
}
</script>

<template>
  <section v-if="props.items.length" class="home-core-advantages" aria-label="核心优势">
    <PageContainer>
      <SectionHeading
        align="center"
        eyebrow="WHY DAXIN"
        title="核心优势"
      />
      <div class="home-core-advantages__grid" :style="{ gridTemplateColumns }" :class="{ 'home-core-advantages__grid--compact': compactLayout }">
        <article
          v-for="(item, index) in props.items"
          :key="`${item.title}-${index}`"
          class="home-core-advantages__card"
          :class="{ 'home-core-advantages__card--expanded': expandedIndex === index }"
          @mouseenter="setHovered(index)"
          @mouseleave="clearHovered(index)"
        >
          <!--
            淡图标背景（需求 2026-10-20②）：用该板块自己的图标放大做低透明度水印，
            不额外增加素材；aria-hidden 且不参与交互，不干扰文字阅读。
          -->
          <span class="home-core-advantages__watermark" aria-hidden="true">
            <img :src="`/images/icons/core-${iconKey(item.title)}-black.png`" alt="">
          </span>
          <button
            type="button"
            class="home-core-advantages__trigger"
            :aria-expanded="expandedIndex === index"
            @click="toggle(index)"
            @focus="setHovered(index)"
            @blur="clearHovered(index)"
          >
            <span class="home-core-advantages__icon" :class="{ 'home-core-advantages__icon--red': expandedIndex === index }" aria-hidden="true">
              <img :src="`/images/icons/core-${iconKey(item.title)}-black.png`" alt="">
              <img :src="`/images/icons/core-${iconKey(item.title)}-red.png`" alt="">
            </span>
            <span class="home-core-advantages__title">{{ displayTitle(item.title) }}</span>
          </button>
          <p v-if="expandedIndex === index" class="home-core-advantages__description">
            <span class="home-core-advantages__description-copy">
              <template v-for="(segment, segmentIndex) in segments(item)" :key="segmentIndex">
                <strong v-if="segment.emphasis" class="home-core-advantages__emphasis">{{ segment.text }}</strong>
                <span v-else>{{ segment.text }}</span>
              </template>
            </span>
          </p>
        </article>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-core-advantages {
  padding-block: var(--space-section);
  background: var(--color-bg-light);
}

.home-core-advantages__grid {
  display: grid;
  gap: var(--space-4);
  /* 需求 2026-10-20①：标题与内容之间空一行，避免拥挤 */
  margin-top: var(--space-8);
  transition: grid-template-columns var(--transition-base);
}

.home-core-advantages__card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 252px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base), background-color var(--transition-base);
}

/*
 * 淡图标背景：放大后的板块图标作为水印。
 * 收起态很淡（opacity .06），展开态加深并同时给卡片染色，
 * 形成需求③要求的「从淡图标背景过渡到带色背景」。
 */
.home-core-advantages__watermark {
  position: absolute;
  right: calc(var(--space-4) * -1);
  bottom: calc(var(--space-6) * -1);
  width: 168px;
  height: 168px;
  pointer-events: none;
  opacity: 0.06;
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.home-core-advantages__watermark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-core-advantages__card--expanded {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  /* 展开态换带色底，与收起态的白底明确区分 */
  background-color: var(--color-primary-light);
}

.home-core-advantages__card--expanded .home-core-advantages__watermark {
  opacity: 0.14;
  transform: scale(1.06);
}

.home-core-advantages__trigger {
  position: relative;
  /* 水印是绝对定位，必须把文字层抬到它上面，否则水印会盖住标题 */
  z-index: 1;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: center;
  cursor: pointer;
}

.home-core-advantages__icon {
  position: relative;
  display: block;
  width: 48px;
  height: 48px;
  flex: none;
}

.home-core-advantages__icon img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.home-core-advantages__icon img:last-child { opacity: 0; }

/*
 * 展开态图标改为金色（需求 2026-10-20「统一调」）。
 *
 * 原实现是切换到 core-*-red.png，在金色主题下会突然冒出一块红。
 * 这里隐藏红色素材、改为把黑色素材用滤镜染成主题金色系，
 * 既避免新增素材，也保证与配色一致。
 *
 * 注意：这两条必须放在原「--red img:last-child { opacity: 1 }」的位置，
 * 否则会被同权重且更靠后的旧规则覆盖（曾经踩过）。
 */
.home-core-advantages__icon--red img:first-child {
  opacity: 1;
  filter: sepia(1) saturate(2.6) hue-rotate(-14deg) brightness(0.82);
}

.home-core-advantages__icon--red img:last-child { opacity: 0; }

.home-core-advantages__card:hover .home-core-advantages__icon img,
.home-core-advantages__card:focus-within .home-core-advantages__icon img {
  transform: scale(1.06);
}

.home-core-advantages__card--expanded .home-core-advantages__trigger {
  flex: 0 0 auto;
  padding-block: var(--space-4) var(--space-2);
}

.home-core-advantages__title {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.home-core-advantages__card--expanded .home-core-advantages__title {
  color: var(--color-primary-dark);
}

.home-core-advantages__description {
  position: relative;
  /* 与 trigger 同理：文字层要压在水印之上 */
  z-index: 1;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 var(--space-6) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  overflow: visible;
}

.home-core-advantages__description-copy {
  display: block;
  max-width: 26ch;
  margin-inline: auto;
  text-align: center;
}

.home-core-advantages__emphasis {
  color: var(--color-text);
  font-weight: 800;
}

@media (prefers-reduced-motion: reduce) {
  .home-core-advantages__grid,
  .home-core-advantages__card {
    transition: none;
  }
}

@media (max-width: 639px) {
  .home-core-advantages {
    padding-block: var(--space-section);
  }

  .home-core-advantages__grid--compact {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
</style>
