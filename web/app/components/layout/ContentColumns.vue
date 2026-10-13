<script setup lang="ts">
withDefaults(defineProps<{ group?: 'tro' | 'labor' | 'all' }>(), { group: 'all' })
</script>
<template><div class="content-columns"><div class="content-columns__main"><slot /></div><ContentSidebar :group="group" /></div></template>
<style scoped>
.content-columns { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:var(--space-8); align-items:start; }
.content-columns__main { min-width:0; }
/* 侧栏在顶部停留，并由两栏容器底边自然推离视口；上滚时自动反向恢复。 */
@media(min-width:1024px) {
  .content-columns > :deep(.content-sidebar) {
    position:sticky;
    top:calc(var(--header-height) + 16px);
    align-self:start;
  }
}
@media(max-width:1023px) { .content-columns { grid-template-columns:1fr; gap:var(--space-8); } }
</style>
