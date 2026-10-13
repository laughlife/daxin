<script setup lang="ts">
import { ref } from 'vue'
import type { CoreAdvantage } from '~/repositories/home'

const props = defineProps<{
  items: CoreAdvantage[]
}>()

const expandedIndex = ref(-1)

function toggle(index: number) {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

function setExpanded(index: number) {
  expandedIndex.value = index
}

function clearExpanded(index: number) {
  if (expandedIndex.value === index) expandedIndex.value = -1
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
      <div class="home-core-advantages__grid">
        <article
          v-for="(item, index) in props.items"
          :key="`${item.title}-${index}`"
          class="home-core-advantages__card"
          :class="{ 'home-core-advantages__card--expanded': expandedIndex === index }"
          @mouseenter="setExpanded(index)"
          @mouseleave="clearExpanded(index)"
        >
          <button
            type="button"
            class="home-core-advantages__trigger"
            :aria-expanded="expandedIndex === index"
            @click="toggle(index)"
            @focus="setExpanded(index)"
          >
            <span class="home-core-advantages__index">0{{ index + 1 }}</span>
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.home-core-advantages__card {
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.home-core-advantages__index {
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 700;
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
  margin: 0;
  padding: 0 var(--space-6) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.home-core-advantages__emphasis {
  color: #111;
  font-weight: 800;
}

@media (max-width: 1023px) {
  .home-core-advantages__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639px) {
  .home-core-advantages {
    padding-block: var(--space-10);
  }

  .home-core-advantages__grid {
    grid-template-columns: 1fr;
  }
}
</style>
