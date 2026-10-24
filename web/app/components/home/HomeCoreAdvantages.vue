<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CoreAdvantage } from '~/repositories/home'
import swatchTeam from '~/assets/images/core-advantages/swatch-team.png?inline'
import swatchExperience from '~/assets/images/core-advantages/swatch-experience.png?inline'
import swatchEfficiency from '~/assets/images/core-advantages/swatch-efficiency.png?inline'
import swatchProtection from '~/assets/images/core-advantages/swatch-protection.png?inline'

const props = defineProps<{
  items: CoreAdvantage[]
}>()

const hoveredIndex = ref(-1)
const selectedIndex = ref<number | null>(null)
const expandedSwatches: Record<string, string> = {
  team: swatchTeam,
  experience: swatchExperience,
  efficiency: swatchEfficiency,
  protection: swatchProtection,
}
const expandedIndex = computed(() => {
  if (selectedIndex.value !== null) return selectedIndex.value
  return hoveredIndex.value
})
const gridTemplateColumns = computed(() => {
  const columns = Math.min(4, props.items.length)
  if (expandedIndex.value < 0) return `repeat(${columns}, minmax(0, 1fr))`
  return Array.from({ length: columns }, (_, index) => index === expandedIndex.value ? '1.6fr' : '1fr').join(' ')
})

function toggle(index: number) {
  selectedIndex.value = selectedIndex.value === index ? null : index
}

function setHovered(index: number) {
  if (selectedIndex.value === null) hoveredIndex.value = index
}

function clearHovered(index: number) {
  if (selectedIndex.value === null && hoveredIndex.value === index) hoveredIndex.value = -1
}

function iconKey(title: string) {
  if (title.includes('专业')) return 'team'
  if (title.includes('经验')) return 'experience'
  if (title.includes('高效')) return 'efficiency'
  return 'protection'
}

function iconPath(title: string, expanded: boolean) {
  const key = iconKey(title)
  return expanded ? expandedSwatches[key] ?? '' : `/images/icons/core-advantage-${key}.png`
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
      <div class="home-core-advantages__heading">
        <h2 class="home-core-advantages__heading-title">核心优势</h2>
        <p class="home-core-advantages__heading-english">WHY DAXIN</p>
      </div>

      <div class="home-core-advantages__grid" :style="{ gridTemplateColumns }">
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
            <img
              class="home-core-advantages__icon"
              :src="iconPath(item.title, expandedIndex === index)"
              alt=""
              aria-hidden="true"
            >
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
  padding-block: clamp(4.5rem, 8vw, 7rem);
  background-color: #fff;
  background-image: url('/images/backgrounds/core-advantages-wave.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}

.home-core-advantages__heading {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin-bottom: clamp(3.5rem, 7vw, 6.25rem);
  text-align: center;
}

.home-core-advantages__heading-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 4vw, 72px);
  margin: 0;
  color: #2B2927;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 700;
  line-height: 1.15;
}

.home-core-advantages__heading-title::before,
.home-core-advantages__heading-title::after {
  width: clamp(32px, 9vw, 140px);
  height: 1px;
  background: color-mix(in srgb, #2B2927 72%, transparent);
  content: '';
}

.home-core-advantages__heading-english {
  margin: 0;
  color: #E6E6E6;
  font-size: clamp(1rem, 1.7vw, 1.4rem);
  font-weight: 800;
  letter-spacing: .08em;
  line-height: 1.2;
}

.home-core-advantages__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  gap: clamp(1rem, 2.2vw, 2.25rem);
}

.home-core-advantages__card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: clamp(18rem, 18vw, 22rem);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border: 2px solid transparent;
  border-radius: 2rem;
  transition: border-color 220ms ease, background-color 220ms ease, box-shadow 220ms ease;
}

.home-core-advantages__card--expanded {
  padding: 0.75rem clamp(1.25rem, 2vw, 2.1rem);
  border-color: #be8e58;
  border-radius: 3.1rem;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 12px 34px rgb(74 47 18 / 5%);
  min-height: clamp(16rem, 16vw, 19rem);
}

.home-core-advantages__trigger {
  display: flex;
  width: 100%;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 1.5vw, 1.35rem);
  padding: 1rem;
  border: 0;
  border-radius: 1.25rem;
  background: transparent;
  color: #3b3838;
  text-align: center;
  cursor: pointer;
}

.home-core-advantages__trigger:focus-visible {
  outline: 3px solid #eeaf4e;
  outline-offset: 4px;
}

.home-core-advantages__icon {
  display: block;
  width: clamp(8.5rem, 13vw, 14rem);
  aspect-ratio: 1;
  flex: none;
  object-fit: contain;
  transition: transform 220ms ease;
}

.home-core-advantages__card:not(.home-core-advantages__card--expanded) .home-core-advantages__trigger:hover .home-core-advantages__icon,
.home-core-advantages__card:not(.home-core-advantages__card--expanded) .home-core-advantages__trigger:focus-visible .home-core-advantages__icon {
  transform: translateY(-4px) scale(1.025);
}

.home-core-advantages__card--expanded .home-core-advantages__trigger {
  gap: 0.4rem;
  padding: 0 0 0.45rem;
}

.home-core-advantages__card--expanded .home-core-advantages__icon {
  width: clamp(4.25rem, 5.5vw, 5.5rem);
  border-radius: 0.75rem;
}

.home-core-advantages__title {
  color: #3b3838;
  font-size: clamp(1.35rem, 1.7vw, 1.85rem);
  font-weight: 700;
  line-height: 1.35;
}

.home-core-advantages__description {
  width: 100%;
  margin: 0;
  color: #222;
  font-size: clamp(1rem, 1.18vw, 1.35rem);
  line-height: 1.55;
}

.home-core-advantages__description-copy {
  display: block;
  max-width: 27ch;
  margin-inline: auto;
  text-align: left;
}

.home-core-advantages__emphasis {
  color: #EEAF4E;
  font-weight: 800;
}

@media (max-width: 1023px) {
  .home-core-advantages {
    background-size: auto 100%;
  }

  .home-core-advantages__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    align-items: stretch;
  }

  .home-core-advantages__card {
    min-height: 23rem;
  }

  .home-core-advantages__card--expanded {
    min-height: 20rem;
  }

  .home-core-advantages__icon {
    width: clamp(8rem, 21vw, 13rem);
  }

  .home-core-advantages__card--expanded .home-core-advantages__icon {
    width: 4.75rem;
  }
}

@media (max-width: 767px) {
  .home-core-advantages__heading {
    margin-bottom: 2rem;
  }

  .home-core-advantages__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.5rem;
  }

  .home-core-advantages__card {
    min-height: 12rem;
    border-radius: 1.5rem;
  }

  .home-core-advantages__card--expanded {
    grid-column: 1 / -1;
    grid-row: auto;
    min-height: 0;
    padding: 1.15rem;
  }

  .home-core-advantages__trigger {
    gap: 0.5rem;
    padding: 0.75rem 0.25rem;
  }

  .home-core-advantages__icon {
    width: min(30vw, 8rem);
  }

  .home-core-advantages__card--expanded .home-core-advantages__icon {
    width: 6.5rem;
  }

  .home-core-advantages__title {
    font-size: 1.1rem;
  }

  .home-core-advantages__description {
    font-size: 0.95rem;
  }
}

@media (max-width: 640px) {
  .home-core-advantages__heading-title {
    gap: var(--space-3);
    font-size: 1.75rem;
  }

  .home-core-advantages__heading-title::before,
  .home-core-advantages__heading-title::after {
    width: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-core-advantages__card,
  .home-core-advantages__icon {
    transition: none;
  }
}
</style>
