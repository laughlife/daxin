<script setup lang="ts">
import { computed } from 'vue'
import type { UserRole } from '~/types/admin'

/**
 * 后台栏目占位页。
 *
 * 目前各业务模块（文章、案例、品牌、律所、媒体、审核、用户）尚未实现，
 * 这里先提供真实存在的路由，以便：
 * 1. 命名中间件 admin 能覆盖这些路径（否则会被通配内容页抢占，绕过登录校验）；
 * 2. 后台导航链接不会落到公开站点的 404 页面。
 * 业务模块落地后，用真实页面替换本组件即可。
 */
const props = defineProps<{
  /** 栏目名称 */
  title: string
  /** 栏目说明 */
  description: string
  /** 该栏目允许的角色，用于只读角色提示 */
  editorRoles?: UserRole[]
}>()

const { user } = useAdminSession()

const isReadOnly = computed(() => {
  const roles = user.value?.roles ?? []
  if (!props.editorRoles?.length) return false
  return !roles.some((role) => props.editorRoles?.includes(role))
})
</script>

<template>
  <PageContainer class="admin-placeholder" size="wide">
    <h1 class="admin-placeholder__title">{{ title }}</h1>
    <p class="admin-placeholder__desc">{{ description }}</p>

    <BaseCard class="admin-placeholder__card" title="功能建设中">
      <p>
        该模块的页面与接口仍在开发中，当前后台框架仅提供登录、会话保持与导航入口。
      </p>
      <p v-if="isReadOnly" class="admin-placeholder__notice" role="note">
        当前账号为只读角色，可以查看数据，但不能新增或修改内容。
      </p>
    </BaseCard>

    <p class="admin-placeholder__back">
      <NuxtLink to="/admin">返回后台首页</NuxtLink>
    </p>
  </PageContainer>
</template>

<style scoped>
.admin-placeholder {
  padding-block: var(--space-8) var(--space-16);
}

.admin-placeholder__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-placeholder__desc {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-placeholder__card {
  margin-top: var(--space-6);
}

.admin-placeholder__notice {
  margin-top: var(--space-3);
  color: var(--color-warning);
  font-size: var(--text-sm);
}

.admin-placeholder__back {
  margin-top: var(--space-6);
  font-size: var(--text-sm);
}
</style>
