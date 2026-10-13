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

function iconPath(title: string) {
  if (title.includes('专业')) return 'M12 3 3 7.5 12 12l9-4.5L12 3Zm-6 7.5V15l6 3 6-3v-4.5M4 8v5m16-5v5'
  if (title.includes('经验')) return 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2'
  if (title.includes('高效')) return 'm13 2-3 8h7l-6 12 2-9H6l7-11Z'
  return 'm12 22 7-4V11c0-4-3-7-7-9-4 2-7 5-7 9v7l7 4Zm-3-10 2 2 4-4'
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
        description="专业团队与长期实战经验，为跨境企业提供高效、可执行的法律方案。"
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
          <button
            type="button"
            class="home-core-advantages__trigger"
            :aria-expanded="expandedIndex === index"
            @click="toggle(index)"
            @focus="setHovered(index)"
            @blur="clearHovered(index)"
          >
            <svg class="home-core-advantages__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="iconPath(item.title)" />
            </svg>
            <span class="home-core-advantages__title">{{ item.title }}</span>
            <span class="home-core-advantages__plus" aria-hidden="true">{{ expandedIndex === index ? '−' : '+' }}</span>
          </button>
          <p v-if="expandedIndex === index" class="home-core-advantages__description">
            <template v-for="(segment, segmentIndex) in segments(item)" :key="segmentIndex">
              <strong v-if="segment.emphasis" class="home-core-advantages__emphasis">{{ segment.text }}</strong>
              <span v-else>{{ segment.text }}</span>
            </template>
          </p>
        </article>
      </div>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-core-advantages {
  padding-block: var(--space-16);
  background: var(--color-bg-light);
}

.home-core-advantages__grid {
  display: grid;
  gap: var(--space-4);
  transition: grid-template-columns var(--transition-base);
}

.home-core-advantages__card {
  display: flex;
  flex-direction: column;
  height: 220px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
}

.home-core-advantages__card--expanded {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.home-core-advantages__trigger {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  min-height: 82px;
}

.home-core-advantages__icon {
  width: 28px;
  height: 28px;
  color: var(--color-primary);
}

.home-core-advantages__title {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.35;
}

.home-core-advantages__plus {
  color: var(--color-primary);
  font-size: var(--text-xl);
  font-weight: 400;
}

.home-core-advantages__description {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 var(--space-6) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  overflow-y: auto;
}

.home-core-advantages__emphasis {
  color: #111;
  font-weight: 800;
}

@media (max-width: 639px) {
  .home-core-advantages {
    padding-block: var(--space-10);
  }

  .home-core-advantages__grid--compact {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
</style>
