<script setup lang="ts">
/**
 * 品牌管理（/admin/brands）。
 *
 * 列表与编辑表单由 AdminEntityManager 提供（品牌与律所共用同一套字段与列），
 * 这里只声明接口路径、实体名与是否包含「地区」字段。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '品牌管理',
  description: '后台品牌列表与编辑。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminEntityManager
    endpoint="/api/admin/brands"
    entity-label="品牌"
  />
</template>
