// 把首页 Hero 区块的「视觉背景」截成图片，作为首页 Banner 的候选素材。
//
// 背景说明：Hero 的背景是纯 CSS（radial-gradient 光效 + 动画网格 + 漂浮光斑），
// 仓库里并不存在对应的图片文件，因此只能实机渲染后截图。
//
// 输出两张，便于挑选：
//   hero-full.png    含标题与按钮（整块首屏观感）
//   hero-bg-only.png 隐藏文字与按钮，仅保留光效/网格背景（更适合当 Banner）
//
// 用法：PLAYWRIGHT_MODULE=... BROWSER_EXECUTABLE=... node tools/capture-hero-background.mjs
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\legacy-assets'
mkdirSync(outDir, { recursive: true })

const url = process.env.CAPTURE_URL ?? 'http://127.0.0.1:3002/'
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-hero', { timeout: 30000 })
  // 等背景动画稳定，避免截到网格淡入的中间帧
  await page.waitForTimeout(2500)

  const hero = page.locator('.home-hero')
  const box = await hero.boundingBox()
  console.log(`Hero 尺寸：${Math.round(box.width)}x${Math.round(box.height)}`)
  console.log(`分辨率倍率 2x → 输出约 ${Math.round(box.width * 2)}x${Math.round(box.height * 2)}`)

  const fullPath = `${outDir}\\hero-full.png`
  await hero.screenshot({ path: fullPath })
  console.log('已截图（含文字）:', fullPath)

  // 仅背景：临时隐藏 Hero 内的文字与按钮，截图后不影响页面本身
  const bgPath = `${outDir}\\hero-bg-only.png`
  await page.evaluate(() => {
    const heroEl = document.querySelector('.home-hero')
    if (!heroEl) return
    for (const child of heroEl.querySelectorAll('.home-hero__inner *')) {
      child.style.visibility = 'hidden'
    }
  })
  await page.waitForTimeout(600)
  await hero.screenshot({ path: bgPath })
  console.log('已截图（仅背景）:', bgPath)
} finally {
  await browser.close()
}
