<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HomeTeamServiceSection } from '~/repositories/home'

const props = defineProps<{ sections: HomeTeamServiceSection[] }>()

const hoveredIndex = ref(-1)
const selectedIndex = ref(-1)

const PANEL_ARTS = [
  '/images/services/core-business/01-tro-business.jpg',
  '/images/services/core-business/02-ip.jpg',
  '/images/services/core-business/03-disputes.jpg',
  '/images/services/core-business/04-freight-labor.jpg',
  '/images/services/core-business/05-lifecycle.jpg',
]
const PANEL_ARTS_BY_SLUG: Record<string, string> = {
  'team-tro': PANEL_ARTS[0]!,
  'team-ip': PANEL_ARTS[1]!,
  'team-disputes': PANEL_ARTS[2]!,
  'team-cross-border': PANEL_ARTS[3]!,
  'team-lifecycle': PANEL_ARTS[4]!,
}

function toggle(index: number) {
  selectedIndex.value = selectedIndex.value === index ? -1 : index
}

function setHovered(index: number) {
  if (selectedIndex.value < 0) hoveredIndex.value = index
}

function clearHovered(index: number) {
  if (hoveredIndex.value === index) hoveredIndex.value = -1
}

const activeIndex = computed(() => (
  selectedIndex.value >= 0
    ? selectedIndex.value
    : hoveredIndex.value >= 0
      ? hoveredIndex.value
      : props.sections.length - 1
))

function panelArtStyle(slug: string, index: number): Record<string, string> {
  const image = PANEL_ARTS_BY_SLUG[slug] ?? PANEL_ARTS[index]
  return image ? { '--core-panel-art': `url("${image}")` } : {}
}

function hasPanelArt(slug: string, index: number): boolean {
  return Boolean(PANEL_ARTS_BY_SLUG[slug] ?? PANEL_ARTS[index])
}

function titleParts(title: string): Array<{ text: string, latin: boolean }> {
  return title.split(/([A-Za-z0-9]+)/).filter(Boolean).map(text => ({
    text,
    latin: /^[A-Za-z0-9]+$/.test(text),
  }))
}
</script>

<template>
  <section
    v-if="sections.length"
    class="core-business"
    aria-label="核心业务"
  >
    <PageContainer>
      <header class="core-business__heading">
        <h2 class="core-business__heading-title">核心业务</h2>
        <p class="core-business__heading-english">CORE BUSINESS</p>
      </header>

      <div class="core-business__panels">
        <article
          v-for="(section, index) in sections"
          :key="section.slug"
          class="core-business__panel"
          :class="{
            'core-business__panel--active': activeIndex === index,
            'core-business__panel--pinned': selectedIndex === index,
            'core-business__panel--has-art': hasPanelArt(section.slug, index),
          }"
          :style="panelArtStyle(section.slug, index)"
          @mouseenter="setHovered(index)"
          @mouseleave="clearHovered(index)"
        >
          <button
            :id="`core-business-toggle-${section.slug}`"
            class="core-business__toggle"
            type="button"
            :aria-label="`${String(index + 1).padStart(2, '0')} ${section.title}`"
            :aria-expanded="activeIndex === index"
            :aria-controls="`core-business-body-${section.slug}`"
            @click="toggle(index)"
          >
            <span class="core-business__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="core-business__title">
              <span
                v-for="(part, partIndex) in titleParts(section.title)"
                :key="`${section.slug}-title-${partIndex}`"
                :class="{ 'core-business__title-latin': part.latin }"
              >{{ part.text }}</span>
            </span>
          </button>

          <div
            :id="`core-business-body-${section.slug}`"
            class="core-business__body"
            role="region"
            :aria-hidden="activeIndex !== index"
            :aria-labelledby="`core-business-toggle-${section.slug}`"
          >
            <div class="core-business__body-inner">
              <div class="core-business__detail">
                <ul v-if="section.items.length" class="core-business__items">
                  <li v-for="item in section.items" :key="`${section.slug}-${item.title}`">
                    <span class="core-business__item-title">{{ item.title }}</span>
                  </li>
                </ul>
                <div class="core-business__image">
                  <img v-if="section.imageUrl" :src="section.imageUrl" :alt="`${section.title}服务图片`" loading="lazy" decoding="async">
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
  --core-heading: #2B2927;
  --core-english: #E6E6E6;
  --core-outline: #BE8E58;
  --core-body: #3B3838;
  --core-accent: #C7965D;
  padding-block: var(--space-12) var(--space-16);
  background: #fffaf2 url('/images/backgrounds/site-background-warm.png') center / cover no-repeat;
}

.core-business__heading {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-8);
  text-align: center;
}

.core-business__heading-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 4vw, 72px);
  margin: 0;
  color: var(--core-heading);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 700;
  line-height: 1.15;
}

.core-business__heading-title::before,
.core-business__heading-title::after {
  width: clamp(32px, 9vw, 140px);
  height: 1px;
  background: color-mix(in srgb, var(--core-heading) 72%, transparent);
  content: '';
}

.core-business__heading-english {
  margin: 0;
  color: var(--core-english);
  font-size: clamp(1rem, 1.7vw, 1.4rem);
  font-weight: 800;
  letter-spacing: .08em;
  line-height: 1.2;
}

.core-business__panels {
  display: flex;
  gap: var(--space-3);
  align-items: stretch;
  min-height: 400px;
}

.core-business__panel {
  position: relative;
  isolation: isolate;
  display: flex;
  flex: 0 0 152px;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--core-outline) 75%, white);
  border-radius: var(--radius-lg);
  background-color: #9b6843;
  background-image: var(--core-panel-art);
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-shadow: 0 8px 22px rgb(95 65 35 / 8%);
  transition:
    flex-grow var(--transition-base),
    flex-basis var(--transition-base),
    background-color var(--transition-base),
    background-image var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base);
}

.core-business__panel--active {
  flex: 1 1 0;
  padding: var(--space-5);
  border-color: var(--core-outline);
  background-color: rgb(255 255 255 / 94%);
  background-image: none;
  box-shadow: 0 12px 32px rgb(87 62 38 / 12%);
}

.core-business__panel--active::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: url('/favicon.png') center / min(42%, 300px) auto no-repeat;
  content: '';
  opacity: .14;
  pointer-events: none;
}

.core-business__panel--active > * {
  position: relative;
  z-index: 1;
}

.core-business__toggle {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  opacity: 1;
}

.core-business__panel--has-art:not(.core-business__panel--active) .core-business__toggle {
  opacity: 0;
}

.core-business__toggle:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: -5px;
  border-radius: inherit;
}

.core-business__number {
  color: var(--core-outline);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: .16em;
}

.core-business__panel--active .core-business__toggle {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  justify-content: initial;
  column-gap: 0;
  row-gap: 2px;
  opacity: 1;
}

.core-business__panel--active .core-business__number {
  grid-column: 1;
  grid-row: 1;
}

.core-business__panel--active .core-business__title {
  grid-column: 1;
  grid-row: 2;
  max-height: none;
  color: var(--core-body);
  font-size: clamp(1.2rem, 1.8vw, 1.55rem);
  font-weight: 700;
  line-height: 1.3;
  writing-mode: horizontal-tb;
  overflow-wrap: break-word;
}

.core-business__title {
  max-height: 220px;
  color: white;
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
  writing-mode: vertical-rl;
  text-orientation: upright;
  overflow-wrap: anywhere;
}

.core-business__title-latin {
  text-combine-upright: all;
}

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
  flex: 1 1 auto;
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

.core-business__detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, .9fr);
  align-items: stretch;
  gap: var(--space-4);
  height: 100%;
}

.core-business__items {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-2) 0;
  list-style: none;
}

.core-business__items li {
  position: relative;
  display: grid;
  gap: 2px;
  padding-left: var(--space-4);
}

.core-business__items li::before {
  position: absolute;
  top: .58em;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--core-accent);
  content: '';
}

.core-business__item-title {
  color: var(--core-body);
  font-size: var(--text-base);
  font-weight: 600;
  line-height: 1.6;
}

.core-business__image {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 150px;
  overflow: hidden;
  aspect-ratio: 1.15;
  border: 1.5px solid var(--core-outline);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 42%);
  place-items: center;
}

.core-business__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (min-width: 641px) {
  .core-business__panel--active .core-business__image {
    transform: translateX(-24px);
  }
}

@media (max-width: 1023px) {
  .core-business__panels {
    flex-direction: column;
    min-height: 0;
  }

  .core-business__panel,
  .core-business__panel--active {
    flex: 0 0 auto;
    min-height: 88px;
    padding: var(--space-4);
    border-color: var(--core-outline);
    background-color: rgb(255 255 255 / 94%);
    background-image: none;
  }

  .core-business__toggle,
  .core-business__panel--active .core-business__toggle {
    display: grid;
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    justify-content: initial;
    column-gap: 0;
    row-gap: 2px;
    min-height: 54px;
    opacity: 1;
  }

  .core-business__panel--has-art:not(.core-business__panel--active) .core-business__toggle {
    opacity: 1;
  }

  .core-business__number,
  .core-business__panel--active .core-business__number {
    grid-column: 1;
    grid-row: 1;
  }

  .core-business__title,
  .core-business__panel--active .core-business__title {
    grid-column: 1;
    grid-row: 2;
    max-height: none;
    color: var(--core-body);
    font-size: var(--text-base);
    writing-mode: horizontal-tb;
    overflow-wrap: break-word;
  }

  .core-business__panel:not(.core-business__panel--active) .core-business__body {
    display: none;
  }

  .core-business__panel--active .core-business__detail {
    grid-template-columns: minmax(0, 1fr) minmax(120px, .8fr);
  }
}

@media (max-width: 640px) {
  .core-business {
    padding-block: var(--space-10) var(--space-12);
  }

  .core-business__heading-title {
    gap: var(--space-3);
    font-size: 1.75rem;
  }

  .core-business__heading-title::before,
  .core-business__heading-title::after {
    width: 28px;
  }

  .core-business__detail,
  .core-business__panel--active .core-business__detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .core-business__image {
    width: 100%;
    max-width: 420px;
    min-height: 180px;
    aspect-ratio: 1.6;
  }
}
</style>
