// 从首页首屏提取「动态背景」的帧序列，供合成动图使用。
//
// 背景是纯 CSS 动画：
//   - 48px 网格：animation hero-grid 18s linear infinite（平移）
//   - 两个漂浮光斑 .home-hero__orb：animation hero-float
// 因为要让动图能无缝循环，先探测各动画的真实周期，再据此决定采样长度。
//
// 输出：<outDir>/frames/frame-000.png ...
//
// 用法：PLAYWRIGHT_MODULE=... BROWSER_EXECUTABLE=... node tools/capture-hero-animation-frames.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\hero-anim'
const framesDir = `${outDir}\\frames`
mkdirSync(framesDir, { recursive: true })

const url = process.env.CAPTURE_URL ?? 'http://127.0.0.1:3002/'
const frameCount = Number(process.env.FRAME_COUNT ?? 45)
const intervalMs = Number(process.env.FRAME_INTERVAL_MS ?? 130)

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1600, height: 520 }, deviceScaleFactor: 1 })

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-hero', { timeout: 30000 })

  // 只保留背景：隐藏首屏内的文字与按钮
  //
  // 同时隐藏页头与公告条：页头是 position:sticky，会**悬浮在首屏之上**，
  // 元素截图时它正好盖住首屏块，导致导出图里带着 logo 与导航。
  // 注意先用 visibility 隐藏、截图后恢复，避免改变布局（用 display:none 会让首屏位移）。
  await page.evaluate(() => {
    const selectors = [
      '.home-hero__inner',
      '.site-header',
      '.site-announcement',
      // Nuxt DevTools 悬浮球（仅开发模式存在）：不能被烘进导出的素材里
      '#nuxt-devtools-container',
      '#nuxt-devtools-anchor',
      '[data-v-inspector]',
    ]
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.dataset.prevVisibility = el.style.visibility || ''
        el.style.visibility = 'hidden'
      }
    }
  })

  // 先把首屏滚入视口再截图，确保元素完整落在可视区域内
  await page.locator('.home-hero').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  // 探测动画周期：读取装饰元素与首屏的 animation-duration
  const animation = await page.evaluate(() => {
    function read(selector) {
      const el = document.querySelector(selector)
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        name: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
        iteration: style.animationIterationCount,
      }
    }
    return {
      hero: read('.home-hero'),
      decor: read('.home-hero__decor'),
      orbOne: read('.home-hero__orb--one'),
      orbTwo: read('.home-hero__orb--two'),
      gridSize: getComputedStyle(document.querySelector('.home-hero') ?? document.body).backgroundSize,
    }
  })
  console.log('动画参数:', JSON.stringify(animation, null, 2))

  const hero = page.locator('.home-hero')
  const box = await hero.boundingBox()
  console.log(`\nHero 尺寸 ${Math.round(box.width)}x${Math.round(box.height)}`)
  console.log(`采样 ${frameCount} 帧，间隔 ${intervalMs}ms（约 ${((frameCount - 1) * intervalMs / 1000).toFixed(1)} 秒）\n`)

  const started = Date.now()
  for (let index = 0; index < frameCount; index += 1) {
    const target = started + index * intervalMs
    const wait = target - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    const path = `${framesDir}\\frame-${String(index).padStart(3, '0')}.png`
    await hero.screenshot({ path })
    if (index % 10 === 0 || index === frameCount - 1) console.log(`  已采集 ${index + 1}/${frameCount}`)
  }

  writeFileSync(`${outDir}/capture-meta.json`, JSON.stringify({
    frameCount, intervalMs, animation, hero: { width: box.width, height: box.height },
  }, null, 2), 'utf8')
  console.log(`\n帧序列输出目录: ${framesDir}`)
} finally {
  await browser.close()
}
