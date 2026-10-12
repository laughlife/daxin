// 确认动画 WebP 在真实浏览器里确实「动」起来，而不只是加载了第一帧。
//
// 做法：同一个元素隔一段时间截两张图，比较像素差异。
// 若完全一致，说明动图没在播放（或只是静态图）。
import { mkdirSync, readFileSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\hero-anim'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-hero', { timeout: 30000 })

  // 等背景图真正加载完成
  await page.waitForFunction(() => {
    const hero = document.querySelector('.home-hero')
    if (!hero) return false
    const bg = getComputedStyle(hero).backgroundImage
    const match = bg.match(/url\("([^"]+)"\)/)
    if (!match) return false
    const img = new Image()
    img.src = match[1]
    return img.complete && img.naturalWidth > 0
  }, null, { timeout: 60000 })

  const hero = page.locator('.home-hero')
  const first = `${outDir}\\anim-probe-a.png`
  const second = `${outDir}\\anim-probe-b.png`

  await page.waitForTimeout(1500)
  await hero.screenshot({ path: first })
  await page.waitForTimeout(2500)
  await hero.screenshot({ path: second })

  const a = readFileSync(first)
  const b = readFileSync(second)
  const identical = a.equals(b)
  console.log(`两次截图字节数：${a.length} / ${b.length}`)
  console.log(`两张截图是否完全相同：${identical}`)
  console.log(identical
    ? '✖ 完全一致 —— 背景没有在动（或不过是静态图）'
    : '✔ 画面随时间变化 —— 动画 WebP 正在播放')
  process.exitCode = identical ? 1 : 0
} finally {
  await browser.close()
}
