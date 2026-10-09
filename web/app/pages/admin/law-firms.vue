<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '律所管理', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="律所管理"
    description="维护代理律所资料与相关案件记录。"
    :editor-roles="['admin', 'editor']"
  />
</template>
