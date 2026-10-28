<script setup lang="ts">
/**
 * 品牌管理（/admin/brands）。
 *
 * 数据由小程序后台采集维护，后台只做查看与归档：列表展示当前字段，
 * 点「查看」打开只读详情（分类 / 品牌方 / 起诉类型 / 封面 / 简介 / 图片）。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '品牌管理',
  description: '后台品牌列表与详情。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminEntityManager
    endpoint="/api/admin/brands"
    entity-label="品牌"
    kind="brand"
  />
</template>
