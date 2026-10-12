import { nextTick, type Ref } from 'vue'

/**
 * 打开编辑/新增表单后，把表单区域滚动到视口内。
 *
 * 背景：后台各管理页都是「列表在上、编辑表单在下」的结构。
 * 点击列表里的「编辑」时表单确实渲染出来了，但它出现在页面下方，
 * 视口仍停在原来的列表位置，用户看到的是「点了没反应」。
 *
 * 为什么放在组合式函数里而不是每页各写一遍：
 * 文章、案例两个页面都有同样的结构，各写一份必然出现
 * 「一处加了平滑滚动、另一处忘了」的不一致，这类交互应当统一。
 *
 * 用法：
 *   const editorRef = ref<HTMLElement | null>(null)
 *   const { scrollToEditor } = useScrollToEditor(editorRef)
 *   // 打开表单后
 *   editorOpen.value = true
 *   await scrollToEditor()
 *
 * 模板里给表单容器加 ref：
 *   <section v-if="editorOpen" ref="editorRef">
 */
export function useScrollToEditor(target: Ref<HTMLElement | null | undefined>) {
  /**
   * 滚动到表单。
   *
   * 用 nextTick 是因为调用点通常在「刚把 editorOpen 置为 true」之后，
   * 此刻 DOM 还没渲染出来，直接查元素会拿到 null。
   *
   * 滚动用 'smooth'，但尊重系统的「减少动态效果」偏好——
   * 该偏好开启时改为瞬间定位，避免引起不适。
   */
  async function scrollToEditor() {
    await nextTick()
    const element = target.value
    if (!element) return

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    element.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })

    // 表单里有输入框时，顺带把焦点落到第一个可用输入框，
    // 键盘用户无需再 Tab 一圈。
    // 只对真正的输入控件聚焦，避免抢走按钮/链接的焦点语义。
    const firstField = element.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    )
    firstField?.focus?.({ preventScroll: true })
  }

  return { scrollToEditor }
}
