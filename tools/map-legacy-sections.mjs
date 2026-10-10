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

  // 页面上所有含可见文字、且自身高度>20 的元素，按 y 排序，取每段的标题性文字
  const headings = await page.evaluate(() => {
    const out = []
    const seen = new Set()
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,.title,.sub-title')) {
      const t = (el.textContent || '').trim()
      if (!t || t.length > 40) continue
      const r = el.getBoundingClientRect()
      const y = Math.round(r.top + window.scrollY)
      const key = t + '@' + y
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ y, tag: el.tagName, cls: String(el.className).slice(0, 40), text: t })
    }
    out.sort((a, b) => a.y - b.y)
    return out
  })

  console.log(`页面标题元素（共 ${headings.length}）：`)
  for (const h of headings) {
    console.log(`  y=${String(h.y).padStart(5)}  ${h.tag}.${h.cls.padEnd(24)}  ${h.text}`)
  }
  console.log('\n页面总高度:', await page.evaluate(() => document.body.scrollHeight))
} finally {
  await browser.close()
}
