<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '内容审核', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="内容审核"
    description="审核待发布内容，执行通过或驳回操作。"
    :editor-roles="['admin', 'editor']"
  />
</template>
