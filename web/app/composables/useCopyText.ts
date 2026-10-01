import { onScopeDispose, ref } from 'vue'

/**
 * 可复用的纯前端文本复制逻辑（不依赖后端）。
 *
 * - 优先使用 Clipboard API；
 * - Clipboard API 不可用（旧浏览器 / 非安全上下文）时降级为
 *   临时 textarea + document.execCommand('copy')；
 * - 返回 copied / failed 响应式状态，便于组件展示成功或失败反馈；
 * - 状态在 resetDelay 毫秒后自动复位。
 */
export function useCopyText(resetDelay = 2500) {
  const copied = ref(false)
  const failed = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function resetState() {
    copied.value = false
    failed.value = false
  }

  /** 降级复制方案：临时 textarea + execCommand */
  function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch {
      return false
    }
  }

  async function copy(text: string): Promise<boolean> {
    if (!text) return false

    let ok = false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      } else {
        ok = legacyCopy(text)
      }
    } catch {
      ok = false
    }

    copied.value = ok
    failed.value = !ok

    if (timer) clearTimeout(timer)
    timer = setTimeout(resetState, resetDelay)
    return ok
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { copied, failed, copy }
}
