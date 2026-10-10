<script setup lang="ts">
/**
 * 律所管理（/admin/law-firms）。
 *
 * 与品牌共用 AdminEntityManager，唯一差异是 `with-region`：
 * `law_firms` 有 region 列，而 `brands` 没有（品牌提交 region 会被服务端忽略）。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '律所管理',
  description: '后台律所列表与编辑。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminEntityManager
    endpoint="/api/admin/law-firms"
    entity-label="律所"
    with-region
  />
</template>
