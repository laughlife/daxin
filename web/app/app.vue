<script setup lang="ts">
import { siteConfig } from '~/config/site'

/**
 * 应用根组件：只保留路由播报 + 布局 + 页面，
 * 站点壳层结构全部位于 layouts/default.vue。
 */
useHead({
  title: siteConfig.name,
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
