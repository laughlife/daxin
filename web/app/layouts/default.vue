<script setup lang="ts">
/**
 * 默认布局：顶部公告栏 + Header + 主内容区（slot） + Footer。
 * 布局仅负责结构组合，具体实现位于 components/layout/ 下的各个组件。
 */
</script>

<template>
  <div class="site-shell">
    <SiteAnnouncement />
    <SiteHeader />
    <main id="main-content" class="site-shell__main">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.site-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.site-shell__main {
  flex: 1;
}
</style>
