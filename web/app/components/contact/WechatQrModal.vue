<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { siteConfig } from '~/config/site'

/**
 * 微信二维码咨询弹窗（纯前端，不连接后端）。
 * - Escape / 点击遮罩 / 关闭按钮均可关闭；
 * - role=dialog + aria-modal + aria-label；
 * - 打开时焦点移动到关闭按钮，关闭时焦点还给触发元素；
 * - Tab 焦点在弹窗内循环；打开时锁定 body 滚动；
 * - qrSrc 为 null 时展示“二维码待提供”占位卡片，不伪造二维码图片。
 */
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const panelEl = ref<HTMLElement | null>(null)
const closeButtonEl = ref<HTMLButtonElement | null>(null)
let previouslyFocused: HTMLElement | null = null
let savedBodyOverflow = ''

const { copied, failed, copy } = useCopyText()
const copiedChannelId = ref<string | null>(null)

async function copyWechat(channelId: string, wechatId: string) {
  const ok = await copy(wechatId)
  copiedChannelId.value = ok ? channelId : null
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !panelEl.value) return
  const focusables = Array.from(
    panelEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(el => el.offsetParent !== null || el === document.activeElement)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
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

watch(
  () => props.open,
  async (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      lockBodyScroll()
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeButtonEl.value?.focus()
    } else {
      unlockBodyScroll()
      document.removeEventListener('keydown', onKeydown)
      previouslyFocused?.focus?.()
      previouslyFocused = null
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
  <div v-if="open" class="qr-modal">
    <div class="qr-modal__overlay" @click="emit('close')" />
    <div
      ref="panelEl"
      class="qr-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-label="微信咨询与联系方式"
    >
      <header class="qr-modal__head">
        <h2 class="qr-modal__title">微信咨询与联系方式</h2>
        <button
          ref="closeButtonEl"
          type="button"
          class="qr-modal__close"
          aria-label="关闭弹窗"
          @click="emit('close')"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="qr-modal__body">
        <p class="qr-modal__notice">{{ siteConfig.contact.notice }}</p>

        <ul class="qr-modal__channels">
          <li
            v-for="channel in siteConfig.contact.wechatAccounts"
            :key="channel.id"
            class="qr-modal__channel"
          >
            <span class="qr-modal__qr">
              <img
                v-if="channel.qrSrc"
                :src="channel.qrSrc"
                :alt="`${channel.name}微信二维码`"
              >
              <span v-else class="qr-modal__qr-placeholder" role="img" :aria-label="`${channel.name}二维码待提供占位`">
                二维码<br>待提供
              </span>
            </span>
            <span class="qr-modal__channel-info">
              <span class="qr-modal__channel-name">{{ channel.name }}</span>
              <span class="qr-modal__channel-id">
                微信号：<strong>{{ channel.wechatId }}</strong>
              </span>
              <span class="qr-modal__channel-purpose">{{ channel.purpose }}</span>
              <span class="qr-modal__channel-actions">
                <button
                  type="button"
                  class="qr-modal__copy"
                  @click="copyWechat(channel.id, channel.wechatId)"
                >
                  {{ copied && copiedChannelId === channel.id ? '已复制' : '复制微信号' }}
                </button>
                <span
                  v-if="failed && copiedChannelId === null"
                  class="qr-modal__copy-feedback"
                  role="status"
                >
                  复制失败，请手动复制
                </span>
              </span>
            </span>
          </li>
        </ul>

        <ul class="qr-modal__contact">
          <li>电话：{{ siteConfig.contact.phone }}</li>
          <li>邮箱：{{ siteConfig.contact.email }}</li>
          <li>地址：{{ siteConfig.contact.address }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-mobile-overlay);
  background-color: var(--color-bg-overlay);
}

.qr-modal__panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-mobile-panel);
  display: flex;
  flex-direction: column;
  width: min(92vw, 560px);
  max-height: min(86vh, 720px);
  background-color: var(--color-bg-page);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.qr-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.qr-modal__title {
  font-size: var(--text-xl);
  color: var(--color-text);
}

.qr-modal__close {
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

.qr-modal__close:hover {
  background-color: var(--color-bg-light);
  color: var(--color-text);
}

.qr-modal__body {
  padding: var(--space-6);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.qr-modal__notice {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.qr-modal__channels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.qr-modal__channel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.qr-modal__qr {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-light);
  overflow: hidden;
}

.qr-modal__qr img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-modal__qr-placeholder {
  font-size: var(--text-sm);
  text-align: center;
  line-height: var(--leading-tight);
  color: var(--color-text-muted);
}

.qr-modal__channel-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
}

.qr-modal__channel-name {
  font-weight: 600;
  color: var(--color-text);
}

.qr-modal__channel-id strong {
  color: var(--color-primary);
}

.qr-modal__channel-purpose {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.qr-modal__channel-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.qr-modal__copy {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--color-primary);
  transition: background-color var(--transition-base);
}

.qr-modal__copy:hover {
  background-color: var(--color-primary-light);
}

.qr-modal__copy-feedback {
  font-size: var(--text-xs);
  color: var(--color-error);
}

.qr-modal__contact {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--text-sm);
}

@media (max-width: 639px) {
  .qr-modal__channels {
    grid-template-columns: 1fr;
  }

  .qr-modal__body {
    padding: var(--space-4);
  }
}
</style>
