import { nextTick, type Ref } from 'vue'

/**
 * 打开编辑/新增表单后，把表单区域滚动到视口内。
 *
 * 背景：后台各管理页都是「列表在上、编辑表单在下」的结构。
 * 点击列表里的「编辑」时表单确实渲染出来了，但它出现在页面下方，
 * 视口仍停在原来的列表位置，用户看到的是「点了没反应」。
 *
 * 为什么放在组合式函数里而不是每页各写一遍：
 * 文章、案例、律所等页面都有同样的结构，各写一份必然出现
 * 「一处加了平滑滚动、另一处忘了」的不一致，这类交互应当统一。
 *
 * 为什么不能只调用一次 scrollIntoView：
 *   1) 调用点常常在「刚把 editorOpen 置为 true」之后，此刻 DOM 还没渲染，
 *      拿不到元素（深链从别的页面跳进来时尤其明显）；
 *   2) 表单高度会随异步详情数据变化，一次滚动之后位置又会偏掉；
 *   3) 平滑滚动是异步的，刚发起就检查会读到旧的 scrollY。
 * 因此这里改为「等到元素存在且滚动结果稳定」再返回。
 *
 * 用法：
 *   const editorRef = ref<HTMLElement | null>(null)
 *   const { scrollToEditor } = useScrollToEditor(editorRef, { selector: '[data-scroll-target="editor"]' })
 *   await scrollToEditor()
 *
 * 为什么还要 selector 兜底：
 *   实测在「从其它页面客户端跳转进来」的场景下，编辑态虽已在服务端渲染出来，
 *   但模板 ref 仍可能为 null（ref 绑定与组件挂载的时序问题），
 *   只依赖 ref 会静默什么都不做。加一个 DOM 查询兜底即可稳定拿到元素。
 *
 * 模板里 ref 必须挂在**原生元素**上（挂在组件上拿到的是组件实例，没有 scrollIntoView），
 * 并建议同时打上 data-scroll-target 供兜底查询使用。
 */
export function useScrollToEditor(
  target: Ref<HTMLElement | null | undefined>,
  options: { selector?: string, timeoutMs?: number } = {},
) {
  const selector = options.selector ?? ''
  const timeoutMs = options.timeoutMs ?? 4000

  /** 当前是否处于浏览器环境。 */
  const isClient = typeof window !== 'undefined' && typeof document !== 'undefined'

  /**
   * 解析要滚动的元素：优先模板 ref，其次 DOM 查询兜底。
   * 两者都没有时返回 null。
   */
  function resolveElement(): HTMLElement | null {
    const fromRef = target.value
    if (fromRef) return fromRef
    if (isClient && selector) {
      return document.querySelector<HTMLElement>(selector)
    }
    return null
  }

  /** 等到元素出现；超时后返回 null，不无限等待。 */
  async function waitForElement(): Promise<HTMLElement | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      await nextTick()
      const element = resolveElement()
      if (element) return element
      if (Date.now() > deadline) return null
      // 让出一帧，等待 Vue 完成挂载或下一次布局
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
        else setTimeout(resolve, 16)
      })
    }
  }

  /**
   * 滚动到表单，并确认滚动确实发生。
   *
   * 返回是否已滚动到目标，便于调用方或测试断言，避免「静默没生效」。
   */
  async function scrollToEditor(): Promise<boolean> {
    const element = await waitForElement()
    if (!element) return false

    const before = window.scrollY

    /*
     * 直接设置滚动位置，不用平滑动画。
     *
     * 平滑滚动是异步的，会受当时的页面状态影响；直接同步赋值立即生效，
     * 也正是「点击后要转到填写区域」真正需要的效果。
     */
    const scrollOnce = () => {
      const rect = element.getBoundingClientRect()
      window.scrollTo(0, Math.max(0, window.scrollY + rect.top))
    }

    scrollOnce()

    /*
     * 重试若干次。
     *
     * 从其它页面**客户端跳转**进来时，Nuxt 的页面过渡会短暂锁住滚动，
     * 期间 scrollTo 不生效（实测调用后 scrollY 恒为 0，而同一元素稍后再滚就正常）。
     * 因此不能滚一次就算完，要在随后一小段时间内持续校正位置，
     * 直到元素真正进入视口或到达超时。
     */
    const deadline = Date.now() + 2500
    let last = window.scrollY
    let stableFrames = 0
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const rect = element.getBoundingClientRect()
      const inView = rect.top < window.innerHeight && rect.bottom > 0
      const current = window.scrollY

      if (!inView) {
        // 还没到位：再校正一次（应对过渡锁滚动 / 后续布局变化）
        scrollOnce()
        stableFrames = 0
        last = window.scrollY
        continue
      }

      if (current === last) {
        stableFrames += 1
        if (stableFrames >= 3) break
      } else {
        stableFrames = 0
        last = current
      }
    }

    const finalRect = element.getBoundingClientRect()
    const inViewport = finalRect.top < window.innerHeight && finalRect.bottom > 0
    const moved = window.scrollY !== before

    // 表单里有输入框时顺带聚焦第一个可用控件，键盘用户无需再 Tab 一圈。
    const firstField = element.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    )
    firstField?.focus?.({ preventScroll: true })

    return moved || inViewport
  }

  /**
   * 触发滚动，但**不等待**它完成。
   *
   * 为什么要有这个版本：scrollToEditor 内部会等元素出现、并等平滑动画停下来，
   * 最长可等待数秒。若在 setup 阶段 await 它，组件的挂载会被一直挡住，
   * 表现为「表单压根没渲染出来」——这比不滚动严重得多。
   * 因此凡是在挂载/打开流程里调用，一律用这个不阻塞的版本。
   */
  function requestScrollToEditor(): void {
    void scrollToEditor()
  }

  return { scrollToEditor, requestScrollToEditor }
}
