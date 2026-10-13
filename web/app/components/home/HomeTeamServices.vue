<script setup lang="ts">
import type { HomeTeamServiceSection } from '~/repositories/home'

defineProps<{
  sections: HomeTeamServiceSection[]
}>()

function iconFor(section: HomeTeamServiceSection): string {
  const title = section.title.toLowerCase()

  if (title.includes('tro')) return '/images/services/service-tro.png'
  if (title.includes('知识产权') || title.includes('亚马逊')) return '/images/services/service-ip.png'
  if (title.includes('涉外')) return '/images/services/service-dispute.png'
  if (title.includes('跨境') || title.includes('劳动')) return '/images/services/service-cross-border.png'
  return ''
}
</script>

<template>
  <section v-if="sections.length" class="home-team-services" aria-label="跨境法律服务">
    <div class="home-team-services__grid">
      <article v-for="section in sections" :key="section.slug" class="home-team-services__card">
        <div class="home-team-services__heading">
          <img
            v-if="iconFor(section)"
            class="home-team-services__icon"
            :src="iconFor(section)"
            alt=""
            aria-hidden="true"
          >
          <h3 class="home-team-services__title">{{ section.title }}</h3>
        </div>
        <ul class="home-team-services__items">
          <li v-for="item in section.items" :key="`${section.slug}-${item.title}`">
            <span aria-hidden="true">✦</span>
            <span>{{ item.title }}</span>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.home-team-services {
  min-width: 0;
}

.home-team-services__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.home-team-services__card {
  min-width: 0;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-light);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base), background-color var(--transition-base);
}

.home-team-services__card:hover,
.home-team-services__card:focus-within {
  border-color: var(--color-primary);
  background: var(--color-bg-page);
  box-shadow: var(--shadow-md);
  transform: scale(1.015);
}

.home-team-services__title {
  color: var(--color-text);
  font-size: var(--text-lg);
  line-height: 1.35;
  margin: 0;
}

.home-team-services__heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
}

.home-team-services__icon {
  display: block;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.home-team-services__items {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

@media (prefers-reduced-motion: reduce) {
  .home-team-services__card {
    transition: none;
  }

  .home-team-services__card:hover,
  .home-team-services__card:focus-within {
    transform: none;
  }
}

.home-team-services__items li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  line-height: 1.5;
}

.home-team-services__items li > span:first-child {
  flex: 0 0 auto;
  color: var(--color-primary);
}

@media (max-width: 639px) {
  .home-team-services__grid {
    grid-template-columns: 1fr;
  }

  .home-team-services__heading {
    min-height: 48px;
  }

  .home-team-services__icon {
    flex-basis: 48px;
    width: 48px;
    height: 48px;
  }
}
</style>
