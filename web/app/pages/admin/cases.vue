<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '案例管理', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="案例管理"
    description="维护 TRO 案件数据、进展与关联品牌律所。"
    :editor-roles="['admin', 'editor']"
  />
</template>
