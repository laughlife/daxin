// 公众号文章页：封面长图与标题字号的读取。
//
// 实测结论（2026-10-23，见 README/工具脚本）：
// - 文章页用手机微信 UA 正常返回；采集器 UA（DaxinWechatAlbumSync/1.0）会被微信
//   拦成「环境异常」，因此文章页请求必须用 MOBILE_WECHAT_UA；
// - 长图地址在页面内联脚本 `var msg_cdn_url = "..."` 里（900x382）；
// - 标题字号不在 HTML 里，是运行时 computed 值，必须用真实浏览器读
//   `getComputedStyle(document.getElementById('activity-name')).fontSize`。
//
// 这里只放纯函数与浏览器读取器，不依赖数据库与 OSS，便于单测。

/** 手机微信 UA：文章页抓取与字号读取都用它。 */
export const MOBILE_WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40 NetType=WIFI Language/zh_CN'

const MSG_CDN_PATTERN = /var\s+msg_cdn_url\s*=\s*"([^"]+)"/

/** 从文章页 HTML 提取长图地址；没有或不是 http(s) 时返回空串。 */
export function extractMsgCdnUrl(html: string): string {
  const match = MSG_CDN_PATTERN.exec(String(html ?? ''))
  const value = match?.[1]?.trim() ?? ''
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return ''
  }
}

/** 把 "22px" 解析成 22；非法或超出 smallint 合理范围时返回 null。 */
export function parseFontSizePx(raw: unknown): number | null {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*px\s*$/i.exec(String(raw ?? ''))
  if (!match) return null
  const value = Math.round(Number(match[1]))
  return value >= 1 && value <= 255 ? value : null
}

/** 是否「长图/横幅」封面：宽 ≥600 且宽高比 ≥1.5（900x382 ≈ 2.36）。 */
export function isWideCover(width: number | null, height: number | null): boolean {
  if (!width || !height) return false
  return width >= 600 && width / height >= 1.5
}

export type CoverResolutionInput = {
  /** 文章当前封面 media id；没有则为 null。 */
  existingCoverId: number | null
  existingCoverWidth: number | null
  existingCoverHeight: number | null
  /** 本次采集准备写入的封面 media id；上传失败时为 null。 */
  nextCoverId: number | null
  /** 本次封面是否来自文章页长图（msg_cdn_url）。 */
  nextIsLong: boolean
}

/**
 * 决定文章最终写哪个封面：
 * - 本次没有新封面（上传失败）→ 保留现有，绝不清空；
 * - 新封面是长图 → 直接覆盖；
 * - 文章本来没有封面 → 用新封面；
 * - 现有封面已是长图、新封面只是方图 → 保留现有（避免方图把长图盖回去）；
 * - 其余情况（现有是方图/未知尺寸）→ 用新封面。
 */
export function resolveArticleCoverId(input: CoverResolutionInput): number | null {
  const existing = input.existingCoverId ?? null
  const next = input.nextCoverId ?? null
  if (next === null) return existing
  if (input.nextIsLong) return next
  if (existing === null) return next
  return isWideCover(input.existingCoverWidth, input.existingCoverHeight) ? existing : next
}

export type TitleFontSizeReader = {
  /** 读取标题字号；失败（含被拦、Playwright 不可用）返回 null，不抛错。 */
  read: (url: string) => Promise<number | null>
  close: () => Promise<void>
}

type RouteLike = {
  request: () => { resourceType: () => string }
  abort: () => Promise<void>
  continue: () => Promise<void>
}
type PageLike = {
  route: (pattern: string, handler: (route: RouteLike) => void) => Promise<void>
  goto: (url: string, options?: Record<string, unknown>) => Promise<{ status: () => number } | null>
  waitForSelector: (selector: string, options?: Record<string, unknown>) => Promise<unknown>
  // 用字符串表达式而不是函数：服务端 tsconfig 没有 dom lib，函数体里的
  // document/getComputedStyle 会过不了类型检查。字符串在浏览器里求值。
  evaluate: <T>(expression: string) => Promise<T>
  close: () => Promise<void>
}
type ContextLike = { newPage: () => Promise<PageLike>; close: () => Promise<void> }
type BrowserLike = { newContext: (options?: Record<string, unknown>) => Promise<ContextLike>; close: () => Promise<void> }
type ChromiumLike = { launch: (options?: Record<string, unknown>) => Promise<BrowserLike> }

/** 本机 Chrome 路径，可用 BROWSER_EXECUTABLE 覆盖；缺失时 Playwright 会自行报错并降级。 */
const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

export type TitleFontSizeReaderOptions = {
  /** Playwright 模块路径/包名；默认读 PLAYWRIGHT_MODULE，未配置时用 playwright-core。 */
  modulePath?: string
  executablePath?: string
  headless?: boolean
  /** 两次浏览器读取之间的最小间隔，避免给微信造成压力。 */
  minIntervalMs?: number
  logger?: (message: string, detail?: unknown) => void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 创建一个惰性启动的标题字号读取器：第一次 read 时才启动 Chrome，
 * 之后复用同一个浏览器与上下文；任何失败都只告警并返回 null。
 */
export function createTitleFontSizeReader(options: TitleFontSizeReaderOptions = {}): TitleFontSizeReader {
  const modulePath = options.modulePath ?? process.env.PLAYWRIGHT_MODULE ?? 'playwright-core'
  const executablePath = options.executablePath ?? process.env.BROWSER_EXECUTABLE ?? DEFAULT_CHROME_PATH
  const minIntervalMs = options.minIntervalMs ?? 1000
  const logger = options.logger ?? ((message: string, detail?: unknown) => console.warn(message, detail ?? ''))
  const headless = options.headless ?? true

  let browser: BrowserLike | null = null
  let context: ContextLike | null = null
  let launchFailed = false
  let closed = false
  let lastReadAt = 0

  async function ensureContext(): Promise<ContextLike | null> {
    if (context) return context
    if (launchFailed || closed) return null
    try {
      const playwright = await import(modulePath) as unknown as { chromium: ChromiumLike }
      browser = await playwright.chromium.launch({
        headless,
        executablePath,
        args: ['--disable-blink-features=AutomationControlled'],
        timeout: 90000,
      })
      context = await browser.newContext({
        userAgent: MOBILE_WECHAT_UA,
        viewport: { width: 414, height: 896 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      })
      return context
    } catch (error) {
      launchFailed = true
      logger('[wechat-album-import] Playwright 不可用，标题字号将留空（可设置 PLAYWRIGHT_MODULE / BROWSER_EXECUTABLE）', {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  async function read(url: string): Promise<number | null> {
    if (closed) return null
    const wait = lastReadAt + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    lastReadAt = Date.now()

    const activeContext = await ensureContext()
    if (!activeContext) return null

    let page: PageLike | null = null
    try {
      page = await activeContext.newPage()
      // 正文配图与字体对取字号没有影响，拦掉可把单页加载压到 2 秒内。
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (type === 'image' || type === 'media' || type === 'font') {
          void route.abort().catch(() => {})
          return
        }
        void route.continue().catch(() => {})
      })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForSelector('#activity-name', { timeout: 20000 })
      const raw = await page.evaluate<string>(`(() => {
        const element = document.getElementById('activity-name')
        return element ? getComputedStyle(element).fontSize : ''
      })()`)
      return parseFontSizePx(raw)
    } catch (error) {
      logger('[wechat-album-import] 读取标题字号失败，文章仍会入库（字号为 NULL）', {
        url: url.slice(0, 120),
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      if (page) await page.close().catch(() => {})
    }
  }

  async function close(): Promise<void> {
    closed = true
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    context = null
    browser = null
  }

  return { read, close }
}
