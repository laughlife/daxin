<script setup lang="ts">
import { computed, ref } from 'vue'

interface GuideBook {
  slug: string
  title: string
  summary: string
  image: string
  imageAlt: string
  href: string
  illustrated?: boolean
}

const guideBooks: GuideBook[] = [
  {
    slug: 'tro',
    title: 'TRO 侵权案件应对指南',
    summary: '了解 TRO 风险识别、案件处理与应诉和解的常见路径。',
    image: '/images/guides/tro.png',
    imageAlt: 'TRO 跨境卖家法律指南封面',
    href: '/faq/tro',
  },
  {
    slug: 'labor',
    title: '劳动用工合规指南',
    summary: '了解劳动关系管理与劳动争议处理中的常见法律问题。',
    image: '/images/guides/labor-law.png',
    imageAlt: '劳动法法律指南封面',
    href: '/faq/labor',
  },
  {
    slug: 'cross-border',
    title: '跨境经营法律指南',
    summary: '关注知识产权、产品合规及跨境经营中的法律风险。',
    image: '/images/services/service-dispute.png',
    imageAlt: '跨境法律文书与风险提示插画',
    href: '/faq/cross-border',
    illustrated: true,
  },
]

const currentIndex = ref(0)
const displayedGuides = computed(() =>
  guideBooks.map((_, offset) => guideBooks[(currentIndex.value + offset) % guideBooks.length]!),
)

function moveGuide(direction: -1 | 1) {
  currentIndex.value = (currentIndex.value + direction + guideBooks.length) % guideBooks.length
}
</script>

<template>
  <section class="home-legal-guides" aria-label="普法干货">
    <PageContainer>
      <div class="home-legal-guides__header">
        <SectionHeading
          align="center"
          eyebrow="LEGAL GUIDES"
          title="普法干货"
          description="聚焦跨境经营中的常见法律问题，提供实用知识参考。"
        />
        <div class="home-legal-guides__controls" aria-label="切换普法指南">
          <span aria-live="polite" class="home-legal-guides__position">第 {{ currentIndex + 1 }} / {{ guideBooks.length }} 本</span>
          <button type="button" aria-label="上一本" @click="moveGuide(-1)">←</button>
          <button type="button" aria-label="下一本" @click="moveGuide(1)">→</button>
        </div>
      </div>

      <TransitionGroup name="home-legal-guides__card" tag="div" class="home-legal-guides__grid">
        <NuxtLink
          v-for="guide in displayedGuides"
          :key="guide.slug"
          :to="guide.href"
          class="home-legal-guides__card"
        >
          <div class="home-legal-guides__cover" :class="{ 'home-legal-guides__cover--illustrated': guide.illustrated }">
            <img :src="guide.image" :alt="guide.imageAlt" loading="lazy">
            <span v-if="guide.illustrated" class="home-legal-guides__cover-label">跨境经营法律指南</span>
          </div>
          <div class="home-legal-guides__body">
            <h3>{{ guide.title }}</h3>
            <p>{{ guide.summary }}</p>
            <span class="home-legal-guides__link">查看专题 <span aria-hidden="true">→</span></span>
          </div>
        </NuxtLink>
      </TransitionGroup>
    </PageContainer>
  </section>
</template>

<style scoped>
.home-legal-guides {
  padding-block: var(--space-16);
  background: var(--color-bg-page);
}

.home-legal-guides__header {
  position: relative;
}

.home-legal-guides__controls {
  position: absolute;
  right: 0;
  bottom: var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.home-legal-guides__position {
  margin-right: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.home-legal-guides__controls button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  color: var(--color-primary);
  font-size: var(--text-lg);
  transition: color var(--transition-base), background-color var(--transition-base), border-color var(--transition-base);
}

.home-legal-guides__controls button:hover,
.home-legal-guides__controls button:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.home-legal-guides__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--space-5);
  margin-top: var(--space-8);
}

.home-legal-guides__card {
  display: flex;
  min-width: 0;
  height: 438px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-left: 5px solid color-mix(in srgb, var(--color-primary) 72%, white);
  border-radius: var(--radius-lg);
  background: var(--color-bg-page);
  box-shadow: var(--shadow-sm);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
}

.home-legal-guides__card:hover,
.home-legal-guides__card:focus-visible {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-4px);
}

.home-legal-guides__cover {
  display: grid;
  height: 286px;
  flex: 0 0 286px;
  place-items: center;
  overflow: hidden;
  background: #fff;
}

.home-legal-guides__cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-legal-guides__cover--illustrated {
  position: relative;
  background: radial-gradient(circle at 48% 40%, #fff8f5, #f9d8d4 65%, #ecc0be);
}

.home-legal-guides__cover--illustrated img {
  width: 190px;
  height: 190px;
  object-fit: contain;
}

.home-legal-guides__cover-label {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  left: var(--space-4);
  color: var(--color-primary-dark);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.home-legal-guides__body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.home-legal-guides__body h3 {
  color: var(--color-text);
  font-size: var(--text-lg);
  line-height: 1.4;
}

.home-legal-guides__body p {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.home-legal-guides__link {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.home-legal-guides__card-move {
  transition: transform 0.35s ease;
}

@media (prefers-reduced-motion: reduce) {
  .home-legal-guides__card,
  .home-legal-guides__card-move {
    transition: none;
  }
}

@media (max-width: 767px) {
  .home-legal-guides {
    padding-block: var(--space-10);
  }

  .home-legal-guides__controls {
    position: static;
    justify-content: center;
    margin-top: var(--space-4);
  }

  .home-legal-guides__grid {
    grid-template-columns: 1fr;
    gap: var(--space-4);
    margin-top: var(--space-5);
  }

  .home-legal-guides__card:not(:first-child) {
    display: none;
  }

  .home-legal-guides__card {
    height: 410px;
  }

  .home-legal-guides__cover {
    height: 260px;
    flex-basis: 260px;
  }
}
</style>
