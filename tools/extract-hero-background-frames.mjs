// 从首页首屏「提取」CSS 渲染的动态背景，导出为 Banner 图片。
//
// 背景构成（全部在 CSS 里生成，仓库无对应图片文件）：
//   - radial-gradient 光效（左上红、右下金）
//   - 48px 网格（animation: hero-grid 18s linear infinite 缓慢平移）
//   - 两个漂浮光斑 .home-hero__orb（animation: hero-float）
//
// 由于是动态的，本脚本按固定时间间隔采样多帧，供人工挑选最合适的一帧；
// 隐藏首屏内的文字与按钮，只保留背景本身。
//
// 用法：
//   PLAYWRIGHT_MODULE=... BROWSER_EXECUTABLE=... node tools/extract-hero-background-frames.mjs
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\hero-frames'
mkdirSync(outDir, { recursive: true })

const url = process.env.CAPTURE_URL ?? 'http://127.0.0.1:3002/'
// 采样间隔：网格动画周期 18s，取 6 帧足以覆盖相位差异
const INTERVAL_MS = Number(process.env.FRAME_INTERVAL_MS ?? 1200)
const FRAMES = Number(process.env.FRAME_COUNT ?? 6)

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
// 2x 倍率保证在宽屏 Banner 上不糊
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-hero', { timeout: 30000 })

  // 隐藏首屏内的文字与按钮：Banner 只要背景
  await page.evaluate(() => {
    const hero = document.querySelector('.home-hero')
    if (!hero) return
    const inner = hero.querySelector('.home-hero__inner')
    if (inner) inner.style.visibility = 'hidden'
    // 装饰元素（光斑/竖线）属于背景，保留
  })
  await page.waitForTimeout(800)

  const hero = page.locator('.home-hero')
  const box = await hero.boundingBox()
  console.log(`Hero 尺寸 ${Math.round(box.width)}x${Math.round(box.height)}，2x → ${Math.round(box.width * 2)}x${Math.round(box.height * 2)}`)
  console.log(`采样 ${FRAMES} 帧，间隔 ${INTERVAL_MS}ms\n`)

  for (let index = 0; index < FRAMES; index += 1) {
    const path = `${outDir}\\hero-bg-frame-${String(index + 1).padStart(2, '0')}.png`
    await hero.screenshot({ path })
    console.log(`  第 ${index + 1} 帧: ${path}`)
    if (index < FRAMES - 1) await page.waitForTimeout(INTERVAL_MS)
  }

  // 汇报动画状态，确认背景确实是动态的
  const animation = await page.evaluate(() => {
    const grid = document.querySelector('.home-hero__decor, .home-hero')
    const style = grid ? getComputedStyle(grid) : null
    return {
      gridAnimation: style ? style.animationName : null,
      orbCount: document.querySelectorAll('.home-hero__orb').length,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }
  })
  console.log(`\n动画信息：${JSON.stringify(animation)}`)
} finally {
  await browser.close()
}
