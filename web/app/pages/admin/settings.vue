<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '站点设置', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="站点设置"
    description="维护站点基础信息、联系方式与全局展示配置。"
    :editor-roles="['admin', 'editor']"
  />
</template>
