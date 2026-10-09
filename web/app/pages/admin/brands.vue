<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '品牌管理', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="品牌管理"
    description="维护涉案品牌资料与历史关联案件。"
    :editor-roles="['admin', 'editor']"
  />
</template>
