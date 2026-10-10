import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
try {
  await page.goto(process.env.CAPTURE_URL ?? 'http://127.0.0.1:3002/about', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2000)
  // 先滚到底再回顶部：触发 loading="lazy" 的图片加载，
  // 否则整页截图里首屏以外的图片会显示为空白（截图假象，不是加载失败）。
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const path = process.env.CAPTURE_OUT ?? 'D:\\AppData\\legacy-assets\\about-new-full.png'
  await page.screenshot({ path, fullPage: true })
  console.log('截图:', path)
  // 顺带核对关键计算样式是否符合旧站尺度
  const style = await page.evaluate(() => {
    const title = document.querySelector('.section-heading__title')
    const eyebrow = document.querySelector('.section-heading__eyebrow')
    const gutter = eyebrow ? getComputedStyle(eyebrow, '::before') : null
    return {
      titleSize: title ? getComputedStyle(title).fontSize : null,
      titleWeight: title ? getComputedStyle(title).fontWeight : null,
      titleColor: title ? getComputedStyle(title).color : null,
      titleAlign: title ? getComputedStyle(title).textAlign : null,
      eyebrowSize: eyebrow ? getComputedStyle(eyebrow).fontSize : null,
      eyebrowColor: eyebrow ? getComputedStyle(eyebrow).color : null,
      eyebrowTransform: eyebrow ? getComputedStyle(eyebrow).textTransform : null,
      dashWidth: gutter ? gutter.width : null,
      dashHeight: gutter ? gutter.height : null,
      dashColor: gutter ? gutter.backgroundColor : null,
    }
  })
  console.log(JSON.stringify(style, null, 2))
} finally {
  await browser.close()
}
