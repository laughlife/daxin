// 截取首页首屏（含 Banner），用于人工确认视觉效果。
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\legacy-assets'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
try {
  await page.goto(process.env.CAPTURE_URL ?? 'http://127.0.0.1:3002/', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)
  const path = `${outDir}\\home-top-with-banner.png`
  await page.screenshot({ path })
  console.log('已截图:', path)

  const info = await page.evaluate(() => {
    const img = document.querySelector('.home-banner__img')
    if (!img) return { found: false }
    const rect = img.getBoundingClientRect()
    return {
      found: true,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(rect.width),
      renderedHeight: Math.round(rect.height),
      complete: img.complete,
    }
  })
  console.log('Banner 渲染信息:', JSON.stringify(info))
} finally {
  await browser.close()
}
