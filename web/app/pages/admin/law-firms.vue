<script setup lang="ts">
/**
 * 律所管理（/admin/law-firms）。
 *
 * 数据由小程序后台采集维护，后台只做查看与归档：列表展示名称 / 简称 / 官网 / 关联案件，
 * 点「查看」打开只读详情（简称 / 地址 / 官网 / 地区 / Logo / 简介 / 图片）。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '律所管理',
  description: '后台律所列表与详情。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminEntityManager
    endpoint="/api/admin/law-firms"
    entity-label="律所"
    kind="firm"
  />
</template>
