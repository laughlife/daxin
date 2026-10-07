<script setup lang="ts">
withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all' }>(), { group: 'all' })
</script>
<template><div class="content-columns"><main class="content-columns__main"><slot /></main><ContentSidebar :group="group" /></div></template>
<style scoped>
.content-columns { display:grid; grid-template-columns:minmax(0,1fr) 288px; gap:28px; align-items:start; }
.content-columns__main { min-width:0; }
@media(max-width:1023px) { .content-columns { grid-template-columns:1fr; gap:28px; } }
</style>
