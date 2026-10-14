<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UserRole } from '~/types/admin'

/**
 * 后台首页（控制台外壳）。
 *
 * - 使用 admin 布局，因此不会渲染公开站点的 Header / Footer；
 * - 通过命名中间件 admin 保证必须登录（未登录跳转登录页）；
 * - 左侧导航由共用布局提供；首页集中展示账号信息与退出操作。
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin'
})

useSeoMeta({
  title: '后台管理',
  description: '大信法务后台管理控制台。',
  robots: 'noindex, nofollow'
})

const { user, logout, load } = useAdminSession()

await load()

const loggingOut = ref(false)
const logoutError = ref('')
const roleLabels = computed(() => {
  const labels: Record<UserRole, string> = {
    admin: '超级管理员',
    editor: '内容编辑',
    viewer: '只读查看'
  }
  return (user.value?.roles ?? []).map(role => labels[role] ?? role)
})

async function onLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await logout()
    await navigateTo('/admin/login', { replace: true })
  } catch {
    logoutError.value = '退出登录失败，请稍后重试'
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <PageContainer class="admin-home" size="wide">
    <header class="admin-home__head">
      <h1 class="admin-home__title">后台管理</h1>

      <div v-if="user" class="admin-home__account">
        <dl class="admin-home__identity">
          <div class="admin-home__identity-row">
            <dt>当前账号</dt>
            <dd>
              <span class="admin-home__name">{{ user.displayName }}</span>
              <span class="admin-home__username">（{{ user.username }}）</span>
            </dd>
          </div>
          <div class="admin-home__identity-row">
            <dt>角色</dt>
            <dd>
              <template v-if="roleLabels.length">
                <span v-for="label in roleLabels" :key="label" class="admin-home__role">{{ label }}</span>
              </template>
              <span v-else class="admin-home__username">未分配角色</span>
            </dd>
          </div>
        </dl>
        <BaseButton variant="secondary" size="sm" :disabled="loggingOut" @click="onLogout">
          {{ loggingOut ? '退出中…' : '退出登录' }}
        </BaseButton>
      </div>
    </header>

    <p v-if="logoutError" class="admin-home__error" role="alert">{{ logoutError }}</p>

  </PageContainer>
</template>

<style scoped>
.admin-home {
  padding-block: var(--space-8) var(--space-16);
}

.admin-home__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.admin-home__title {
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-home__account {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.admin-home__identity {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-home__identity-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.admin-home__identity-row dt {
  min-width: 4.5em;
  color: var(--color-text-muted);
}

.admin-home__identity-row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.admin-home__name {
  font-weight: 700;
  color: var(--color-text);
}

.admin-home__username {
  color: var(--color-text-muted);
}

.admin-home__role {
  padding: 2px var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: var(--text-xs);
  font-weight: 600;
}

.admin-home__error {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

</style>
