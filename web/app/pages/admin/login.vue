<script setup lang="ts">
import { computed, ref } from 'vue'
import { siteConfig } from '~/config/site'

const { data: settings } = await useSiteSettings()
const logoSrc = computed(() => {
  const value = settings.value?.settings?.site_logo
  return typeof value === 'string' && value.trim() ? value.trim() : siteConfig.logo.src
})

/**
 * 后台登录页。
 *
 * - 不套用站点布局（layout: false），避免公开站点的 Header / Footer 干扰登录流程；
 * - 会话令牌存放在 HttpOnly Cookie 中，前端不接触，登录成功后统一由 useAdminSession 保存用户信息；
 * - 失败提示区分凭据错误（401）、频率限制（429）与服务端异常，并通过 role="alert" 播报。
 */
definePageMeta({
  layout: false
})

useSeoMeta({
  title: '后台登录',
  description: '大信法务后台管理系统登录入口。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const { login } = useAdminSession()

const username = ref('')
const password = ref('')
const remember = ref(false)
const usernameInput = ref<HTMLInputElement | null>(null)

const errorMessage = ref('')
const errorField = ref<'' | 'username' | 'password'>('')
const pending = ref(false)

/** 仅供跳转使用的安全相对路径：必须以 /admin 开头，且不是 //host 形式的协议相对地址 */
const redirectTarget = computed(() => {
  const raw = route.query.redirect
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  if (!value.startsWith('/admin') || value.startsWith('//')) return null
  const path = value.split(/[?#]/)[0] ?? ''
  if (!path.startsWith('/admin') || path.startsWith('//')) return null
  return path
})

const canSubmit = computed(
  () => !pending.value && username.value.trim().length > 0 && password.value.length > 0
)

function clearError() {
  errorMessage.value = ''
  errorField.value = ''
}

async function onSubmit() {
  if (pending.value) return
  clearError()

  const name = username.value.trim()
  if (!name) {
    errorField.value = 'username'
    errorMessage.value = '请输入用户名'
    usernameInput.value?.focus()
    return
  }
  if (!password.value) {
    errorField.value = 'password'
    errorMessage.value = '请输入密码'
    return
  }

  pending.value = true
  try {
    await login(name, password.value, remember.value)
    await navigateTo(redirectTarget.value ?? '/admin', { replace: true })
  } catch (error) {
    errorMessage.value = resolveAdminErrorMessage(error)
    password.value = ''
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  usernameInput.value?.focus()
})
</script>

<template>
  <div class="admin-login">
    <main class="admin-login__panel">
      <header class="admin-login__head">
        <img v-if="logoSrc" class="admin-login__logo" :src="logoSrc" :alt="siteConfig.logo.alt">
        <span v-else class="admin-login__brand" aria-hidden="true">信</span>
        <h1 class="admin-login__title">后台管理登录</h1>
        <p class="admin-login__subtitle">请使用管理员分配的账号登录后台管理系统。</p>
      </header>

      <BaseCard class="admin-login__card">
        <form class="admin-login__form" novalidate @submit.prevent="onSubmit">
          <div class="admin-login__field">
            <label class="admin-login__label" for="admin-username">用户名</label>
            <input
              id="admin-username"
              ref="usernameInput"
              v-model="username"
              class="admin-login__input"
              type="text"
              name="username"
              autocomplete="username"
              placeholder="请输入用户名"
              required
              :aria-invalid="errorField === 'username' || undefined"
              :aria-describedby="errorMessage ? 'admin-login-error' : undefined"
              @input="clearError"
            >
          </div>

          <div class="admin-login__field">
            <label class="admin-login__label" for="admin-password">密码</label>
            <input
              id="admin-password"
              v-model="password"
              class="admin-login__input"
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="请输入密码"
              required
              :aria-invalid="errorField === 'password' || undefined"
              :aria-describedby="errorMessage ? 'admin-login-error' : undefined"
              @input="clearError"
            >
          </div>

          <div class="admin-login__remember">
            <input
              id="admin-remember"
              v-model="remember"
              class="admin-login__checkbox"
              type="checkbox"
              name="remember"
            >
            <label class="admin-login__remember-label" for="admin-remember">
              记住登录状态
              <span class="admin-login__hint">（在公共电脑上请勿勾选）</span>
            </label>
          </div>

          <p
            v-if="errorMessage"
            id="admin-login-error"
            class="admin-login__error"
            role="alert"
          >
            {{ errorMessage }}
          </p>

          <BaseButton
            type="submit"
            block
            :disabled="!canSubmit"
          >
            {{ pending ? '登录中…' : '登 录' }}
          </BaseButton>
        </form>
      </BaseCard>

      <p class="admin-login__footer">
        <NuxtLink to="/">返回官网首页</NuxtLink>
      </p>
    </main>
  </div>
</template>

<style scoped>
.admin-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--space-10) var(--container-padding);
  background-color: var(--color-bg-light);
}

.admin-login__panel {
  width: 100%;
  max-width: 420px;
}

.admin-login__head {
  margin-bottom: var(--space-6);
  text-align: center;
}

.admin-login__logo {
  display: block;
  width: auto;
  height: 56px;
  max-width: 220px;
  margin: 0 auto;
  object-fit: contain;
}

.admin-login__brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--text-xl);
  font-weight: 700;
}

.admin-login__title {
  margin-top: var(--space-2);
  font-size: var(--text-2xl);
  color: var(--color-text);
}

.admin-login__subtitle {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.admin-login__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-login__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-login__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.admin-login__input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  font-family: inherit;
  font-size: var(--text-base);
  color: var(--color-text);
  transition: border-color var(--transition-base);
}

.admin-login__input:hover {
  border-color: var(--color-primary);
}

.admin-login__input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.admin-login__remember {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-login__checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-primary);
}

.admin-login__remember-label {
  font-size: var(--text-sm);
  color: var(--color-text);
}

.admin-login__hint {
  color: var(--color-text-muted);
}

.admin-login__error {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.admin-login__footer {
  margin-top: var(--space-5);
  text-align: center;
  font-size: var(--text-sm);
}
</style>
