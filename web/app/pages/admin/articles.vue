<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '文章管理', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="文章管理"
    description="发布与维护资讯、法律解读等内容文章。"
    :editor-roles="['admin', 'editor']"
  />
</template>
