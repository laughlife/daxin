<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { NavItem } from '~/types/site'

/**
 * 桌面端主导航（>=1024px 显示）。
 * - 子菜单通过点击 / 键盘（Enter、Space）开合，不依赖 hover；
 * - Escape 关闭子菜单，点击导航区域外自动关闭；
 * - 采用 disclosure 模式：按钮 aria-expanded + aria-controls。
 */
defineProps<{ items: NavItem[] }>()

const route = useRoute()

const openIndex = ref<number | null>(null)
const rootEl = ref<HTMLElement | null>(null)

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? null : index
}

function close() {
  openIndex.value = null
}

/** 当前项或其子项路由命中时视为激活 */
function isActive(item: NavItem): boolean {
  const paths = [item.to, ...(item.children ?? []).map(child => child.to)]
    .filter((path): path is string => Boolean(path))
  return paths.some(
    path => route.path === path || (path !== '/' && route.path.startsWith(`${path}/`))
  )
}

function onDocumentClick(event: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
    close()
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <nav ref="rootEl" class="desktop-nav" aria-label="主导航">
    <ul class="desktop-nav__list">
      <li
        v-for="(item, index) in items"
        :key="item.label"
        class="desktop-nav__item"
        :class="{ 'desktop-nav__item--active': isActive(item) }"
      >
        <template v-if="item.children?.length">
          <button
            :id="`desktop-nav-trigger-${index}`"
            type="button"
            class="desktop-nav__trigger"
            :aria-expanded="openIndex === index"
            aria-haspopup="true"
            :aria-controls="`desktop-nav-panel-${index}`"
            @click="toggle(index)"
          >
            {{ item.label }}
            <span class="desktop-nav__arrow" aria-hidden="true">▾</span>
          </button>
          <ul
            v-show="openIndex === index"
            :id="`desktop-nav-panel-${index}`"
            class="desktop-nav__submenu"
            :aria-labelledby="`desktop-nav-trigger-${index}`"
          >
            <li v-for="child in item.children" :key="child.label">
              <NuxtLink
                :to="child.to ?? '/'"
                class="desktop-nav__sublink"
                @click="close"
              >
                {{ child.label }}
              </NuxtLink>
            </li>
          </ul>
        </template>
        <NuxtLink
          v-else
          :to="item.to ?? '/'"
          class="desktop-nav__link"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.desktop-nav {
  display: none;
}

/* 桌面导航启用阈值：1024px */
@media (min-width: 1024px) {
  .desktop-nav {
    display: block;
  }
}

.desktop-nav__list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.desktop-nav__item {
  position: relative;
}

.desktop-nav__link,
.desktop-nav__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--color-text);
  background: transparent;
  white-space: nowrap;
  transition:
    color var(--transition-base),
    background-color var(--transition-base);
}

.desktop-nav__link:hover,
.desktop-nav__trigger:hover {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
  text-decoration: none;
}

.desktop-nav__item--active > .desktop-nav__link,
.desktop-nav__item--active > .desktop-nav__trigger {
  color: var(--color-primary);
  font-weight: 600;
}

.desktop-nav__arrow {
  font-size: var(--text-xs);
  transition: transform var(--transition-base);
}

.desktop-nav__trigger[aria-expanded='true'] .desktop-nav__arrow {
  transform: rotate(180deg);
}

/* 子菜单面板 */
.desktop-nav__submenu {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0;
  z-index: var(--z-nav-dropdown);
  min-width: 180px;
  padding: var(--space-2);
  background-color: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.desktop-nav__sublink {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
}

.desktop-nav__sublink:hover {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
  text-decoration: none;
}
</style>
