<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '用户与权限', robots: 'noindex, nofollow' })
</script>

<template>
  <AdminPlaceholder
    title="用户与权限"
    description="管理后台账号、角色分配与访问权限（仅超级管理员可见）。"
    :editor-roles="['admin']"
  />
</template>
