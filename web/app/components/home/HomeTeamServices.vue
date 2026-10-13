<script setup lang="ts">
import type { HomeTeamServiceSection } from '~/repositories/home'

defineProps<{
  sections: HomeTeamServiceSection[]
}>()
</script>

<template>
  <section v-if="sections.length" class="home-team-services" aria-label="跨境法律服务">
    <div class="home-team-services__grid">
      <article v-for="section in sections" :key="section.slug" class="home-team-services__card">
        <h3 class="home-team-services__title">{{ section.title }}</h3>
        <p v-if="section.description" class="home-team-services__description">{{ section.description }}</p>
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
}

.home-team-services__title {
  color: var(--color-text);
  font-size: var(--text-lg);
  line-height: 1.35;
}

.home-team-services__description {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.home-team-services__items {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
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
