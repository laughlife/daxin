import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })

try {
  await page.goto('http://yan1.qinianyun.com/about/', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 250))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(2000)

  const report = await page.evaluate(() => {
    const out = []
    // 列出所有文本恰为「国内业务 / 国外业务」的元素，标注是否在导航内
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,a,li')) {
      const t = (el.textContent || '').trim()
      if (t !== '国内业务' && t !== '国外业务') continue
      if (el.children.length > 0) continue
      const inNav = !!el.closest('nav, header, .menu, #menu, .main-menu, .navbar')
      const r = el.getBoundingClientRect()
      out.push({
        tag: el.tagName, cls: String(el.className).slice(0, 60), inNav,
        w: Math.round(r.width), h: Math.round(r.height),
        bg: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
        fontSize: getComputedStyle(el).fontSize,
      })
    }
    return out
  })
  console.log('匹配到的元素：', JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
