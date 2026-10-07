<script setup lang="ts">const route = useRoute()</script>
<template><EntityDetail :key="String(route.params.slug)" kind="brand" :slug="String(route.params.slug)" /></template>
