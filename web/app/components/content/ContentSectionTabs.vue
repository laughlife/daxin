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
.section-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.section-tabs a { padding:8px 14px; border-radius:8px; background:white; color:var(--color-text); font-size:14px; border:1px solid var(--color-border); }
.section-tabs a[aria-current=page] { background:var(--color-primary); color:white; border-color:var(--color-primary); }
</style>
