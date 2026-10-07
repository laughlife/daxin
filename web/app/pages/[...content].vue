<script setup lang="ts">
import { contentArticles, contentSections } from '~/data/mock/catalog'
const route = useRoute()
const path = route.path.replace(/\/$/, '')
const section = contentSections.find(item => item.path === path)
const article = contentArticles.find(item => item.href === path)
if (!section && !article) throw createError({ statusCode: 404, statusMessage: '内容不存在', fatal: true })
useSeoMeta({ title: article?.title ?? section?.title, description: article?.excerpt ?? section?.description })
</script>
<template><ContentListing v-if="section" :key="section.path" :section="section" /><ArticleDetail v-else-if="article" :key="article.href" :article="article" /></template>
