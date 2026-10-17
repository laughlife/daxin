<script setup lang="ts">
import { computed } from 'vue'
import { siteConfig } from '~/config/site'
import { useSiteSettings } from '~/composables/useSiteSettings'

const { data: siteSettings } = await useSiteSettings()
const logoFavicon = computed(() => {
  const value = siteSettings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : ''
})

/**
 * 应用根组件：只保留路由播报 + 布局 + 页面，
 * 站点壳层结构全部位于 layouts/default.vue。
 */
useHead({
  title: siteConfig.name,
  link: computed(() => logoFavicon.value
    ? [{ rel: 'icon', href: logoFavicon.value }]
    : []),
  titleTemplate: (titleChunk?: string) => {
    if (!titleChunk || titleChunk === siteConfig.name) {
      return siteConfig.name
    }
    return `${titleChunk} · ${siteConfig.name}`
  }
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
