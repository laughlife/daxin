// 单独截取首页「团队介绍」区块，便于确认背景图与左侧介绍的搭配效果。
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-team-intro', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const section = page.locator('.home-team-intro')
  await section.screenshot({ path: `${outDir}\\team-intro-only.png` })

  const info = await page.evaluate(() => {
    const el = document.querySelector('.home-team-intro')
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      height: Math.round(r.height),
      bgImage: style.backgroundImage,
      hasImageClass: el.classList.contains('home-team-intro--image'),
    }
  })
  console.log('团队介绍:', JSON.stringify(info, null, 2))

  // 顺带确认移动端不塌
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  const mobile = await page.evaluate(() => {
    const el = document.querySelector('.home-team-intro')
    const content = el.querySelector('.home-team-intro__content')
    return {
      height: Math.round(el.getBoundingClientRect().height),
      contentWidth: Math.round(content.getBoundingClientRect().width),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  console.log('移动端:', JSON.stringify(mobile))
  await section.screenshot({ path: `${outDir}\\team-intro-mobile.png` })
} finally {
  await browser.close()
}
