<script setup lang="ts">
import type { HomeTeamServiceSection } from '~/repositories/home'

defineProps<{
  sections: HomeTeamServiceSection[]
}>()

const SERVICE_ICONS: Record<string, string> = {
  scale: '/images/services/service-tro.png',
  shield: '/images/services/service-ip.png',
  briefcase: '/images/services/service-dispute.png',
  document: '/images/services/service-cross-border.png',
}

function iconFor(section: HomeTeamServiceSection): string {
  return SERVICE_ICONS[section.iconKey] ?? ''
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
  gap: var(--space-3);
}

.home-team-services__card {
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 16px;
  background: var(--color-bg-page);
  box-shadow: 0 8px 24px rgb(24 32 45 / 6%);
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
  min-height: 56px;
}

.home-team-services__icon {
  display: block;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  padding: var(--space-2);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-primary-light) 80%, var(--color-bg-page));
  object-fit: contain;
}

.home-team-services__items {
  display: grid;
  gap: 6px;
  margin: var(--space-2) 0 0;
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
  line-height: 1.4;
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
