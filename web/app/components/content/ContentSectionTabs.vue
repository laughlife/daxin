<script setup lang="ts">
import { contentSections } from '~/config/contentSections'
const props = defineProps<{ path: string }>()
const tabs = computed(() => {
  const group = props.path.split('/')[1]
  const sections = contentSections.filter(item => item.path.split('/')[1] === group)
    .map(item => ({ path: item.path, title: item.title }))
  if (group === 'faq') sections.push({ path: '/faq/plaintiff-firms', title: 'TRO 原告律所' })
  return sections
})
</script>

<template>
  <nav class="section-tabs" aria-label="栏目导航">
    <NuxtLink v-for="item in tabs" :key="item.path" :to="item.path" :aria-current="item.path === path ? 'page' : undefined">{{ item.title }}</NuxtLink>
  </nav>
</template>

<style scoped>
.section-tabs { display:flex; gap:var(--space-3); flex-wrap:wrap; margin-bottom:var(--space-6); }
.section-tabs a { padding:var(--space-2) var(--space-4); border:1px solid var(--color-border); border-radius:var(--radius-full); background:var(--color-bg-page); color:var(--color-text); font-size:var(--text-sm); transition:background-color var(--transition-base),border-color var(--transition-base),color var(--transition-base); }
.section-tabs a[aria-current=page] { background:var(--color-primary); color:white; border-color:var(--color-primary); }
</style>
