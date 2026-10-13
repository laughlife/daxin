<script setup lang="ts">
import type { HomeTeamServiceSection } from '~/repositories/home'

const redundantItemTitles = new Set(['和解', '起诉', '应诉'])

defineProps<{
  sections: HomeTeamServiceSection[]
}>()
</script>

<template>
  <section v-if="sections.length" class="home-team-services" aria-label="跨境法律服务">
    <div class="home-team-services__grid">
      <article v-for="section in sections" :key="section.slug" class="home-team-services__card">
        <h3 class="home-team-services__title">{{ section.title }}</h3>
        <ul class="home-team-services__items">
          <li v-for="item in section.items.filter(item => !redundantItemTitles.has(item.title.trim()))" :key="`${section.slug}-${item.title}`">
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
}
</style>
