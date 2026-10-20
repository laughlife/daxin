// 诊断 /tro/cases 为何等不到 .case-pagination__summary
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (error) => console.log('PAGE ERROR:', String(error).slice(0, 160)))
try {
  await page.goto(`${base}/tro/cases`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)

  const info = await page.evaluate(() => {
    const summary = document.querySelector('.case-pagination__summary')
    const pagination = document.querySelector('.case-pagination')
    const rows = document.querySelectorAll('tbody tr')
    const empty = document.querySelector('.cases-page__empty, .cases-page__empty-title')
    return {
      hasPagination: Boolean(pagination),
      hasSummary: Boolean(summary),
      summaryText: summary?.textContent?.trim().slice(0, 80) ?? '',
      tableRows: rows.length,
      emptyText: empty?.textContent?.trim().slice(0, 60) ?? '',
      // 页面上所有含「条案件」字样的元素
      candidates: [...document.querySelectorAll('p,div,span')]
        .filter((el) => /条案件|页/.test(el.textContent ?? '') && el.children.length === 0)
        .slice(0, 6)
        .map((el) => `${el.className || el.tagName}: ${el.textContent.trim().slice(0, 50)}`),
    }
  })
  console.log(JSON.stringify(info, null, 2))
  await page.screenshot({ path: 'D:/AppData/theme-shots/tro-cases.png' })
} finally {
  await browser.close()
}
