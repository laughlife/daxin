<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { siteConfig } from '~/config/site'
import type { NavItem } from '~/types/site'

/**
 * 移动端抽屉式导航（配合 SiteHeader 的菜单按钮使用）。
 * - 遮罩层 + 右侧抽屉面板 + 关闭按钮；
 * - Escape 关闭；打开时锁定 body 滚动并聚焦关闭按钮；
 * - 子菜单为手风琴模式，可展开 / 收起（aria-expanded + aria-controls）；
 * - 点击任意导航项后关闭抽屉。
 */
const props = defineProps<{
  /** 抽屉是否打开 */
  open: boolean
  /** 导航数据（来自 siteConfig，不硬编码） */
  items: NavItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

const expandedGroups = ref<number[]>([])
const closeButtonEl = ref<HTMLButtonElement | null>(null)
let savedBodyOverflow = ''

function isGroupOpen(index: number): boolean {
  return expandedGroups.value.includes(index)
}

function toggleGroup(index: number) {
  const position = expandedGroups.value.indexOf(index)
  if (position >= 0) {
    expandedGroups.value.splice(position, 1)
  } else {
    expandedGroups.value.push(index)
  }
}

function lockBodyScroll() {
  if (typeof document === 'undefined') return
  savedBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  document.body.style.overflow = savedBodyOverflow
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      lockBodyScroll()
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeButtonEl.value?.focus()
    } else {
      unlockBodyScroll()
      document.removeEventListener('keydown', onKeydown)
    }
  }
)

onBeforeUnmount(() => {
  unlockBodyScroll()
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <div v-if="open" class="mobile-nav">
    <div class="mobile-nav__overlay" @click="emit('close')" />
    <div
      class="mobile-nav__panel"
      role="dialog"
      aria-modal="true"
      :aria-label="`${siteConfig.name}菜单`"
    >
      <div class="mobile-nav__head">
        <span class="mobile-nav__brand">{{ siteConfig.name }}</span>
        <button
          ref="closeButtonEl"
          type="button"
          class="mobile-nav__close"
          aria-label="关闭菜单"
          @click="emit('close')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <nav class="mobile-nav__body" aria-label="移动端主导航">
        <ul class="mobile-nav__list">
          <li v-for="(item, index) in items" :key="item.label" class="mobile-nav__item">
            <template v-if="item.children?.length">
              <div class="mobile-nav__row">
                <NuxtLink
                  v-if="item.to"
                  :to="item.to"
                  class="mobile-nav__link"
                  @click="emit('close')"
                >
                  {{ item.label }}
                </NuxtLink>
                <span v-else class="mobile-nav__group-label">{{ item.label }}</span>
                <button
                  type="button"
                  class="mobile-nav__toggle"
                  :aria-expanded="isGroupOpen(index)"
                  :aria-controls="`mobile-nav-group-${index}`"
                  :aria-label="`展开或收起 ${item.label} 子菜单`"
                  @click="toggleGroup(index)"
                >
                  <span class="mobile-nav__arrow" aria-hidden="true">▾</span>
                </button>
              </div>
              <ul
                v-show="isGroupOpen(index)"
                :id="`mobile-nav-group-${index}`"
                class="mobile-nav__sublist"
              >
                <li v-for="child in item.children" :key="child.label">
                  <NuxtLink
                    :to="child.to ?? '/'"
                    class="mobile-nav__sublink"
                    @click="emit('close')"
                  >
                    {{ child.label }}
                  </NuxtLink>
                </li>
              </ul>
            </template>
            <NuxtLink
              v-else
              :to="item.to ?? '/'"
              class="mobile-nav__link mobile-nav__link--full"
              @click="emit('close')"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="mobile-nav__foot">
        <BaseButton :to="siteConfig.cta.to" variant="primary" block @click="emit('close')">
          {{ siteConfig.cta.label }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-nav__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-mobile-overlay);
  background-color: var(--color-bg-overlay);
}

.mobile-nav__panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-mobile-panel);
  display: flex;
  flex-direction: column;
  width: min(85vw, 320px);
  max-width: 100%;
  background-color: var(--color-bg-page);
  box-shadow: var(--shadow-lg);
}

.mobile-nav__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.mobile-nav__brand {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-primary);
}

.mobile-nav__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  transition: background-color var(--transition-base);
}

.mobile-nav__close:hover {
  background-color: var(--color-bg-light);
  color: var(--color-text);
}

.mobile-nav__body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-2) var(--space-4);
}

.mobile-nav__item {
  border-bottom: 1px solid var(--color-border);
}

.mobile-nav__item:last-child {
  border-bottom: none;
}

.mobile-nav__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.mobile-nav__link,
.mobile-nav__group-label {
  display: block;
  flex: 1;
  padding: var(--space-3) 0;
  font-size: var(--text-base);
  color: var(--color-text);
}

.mobile-nav__link:hover {
  color: var(--color-primary);
  text-decoration: none;
}

.mobile-nav__group-label {
  font-weight: 600;
}

.mobile-nav__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.mobile-nav__toggle:hover {
  background-color: var(--color-bg-light);
}

.mobile-nav__arrow {
  transition: transform var(--transition-base);
}

.mobile-nav__toggle[aria-expanded='true'] .mobile-nav__arrow {
  transform: rotate(180deg);
}

.mobile-nav__sublist {
  padding-bottom: var(--space-2);
}

.mobile-nav__sublink {
  display: block;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
}

.mobile-nav__sublink:hover {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
  text-decoration: none;
}

.mobile-nav__foot {
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}
</style>
