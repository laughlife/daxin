<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '媒体库', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="媒体库"
    description="管理图片、附件等媒体资源与上传记录。"
    :editor-roles="['admin', 'editor']"
  />
</template>
