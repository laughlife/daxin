// 截取侵权品牌列表页底部，确认「底下的白框」具体指向哪块 DOM。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/brands`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)

  const info = await page.evaluate(() => {
    const nav = document.querySelector('.brand-directory__pagination')
    const list = document.querySelector('.brand-directory__list')
    const grid = document.querySelector('.brand-directory__grid')
    const head = document.querySelector('.brand-directory__result-head')
    const describe = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return {
        className: el.className,
        height: Math.round(r.height),
        background: s.backgroundColor,
        border: `${s.borderTopWidth} ${s.borderTopStyle}`,
        padding: s.padding,
      }
    }
    return {
      cardCount: document.querySelectorAll('.brand-card').length,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns : '',
      head: describe(head),
      list: describe(list),
      nav: describe(nav),
      pageSizeOptions: [...document.querySelectorAll('.brand-directory__result-head option')].map((o) => o.textContent.trim()),
    }
  })
  console.log(JSON.stringify(info, null, 2))

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${outDir}\\brands-bottom.png` })
} finally {
  await browser.close()
}
