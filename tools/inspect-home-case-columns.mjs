// 检查首页案例预览四个分区的标题与条数，用于定位 browser-check 的「标题齐全」失败。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2000)

  const info = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.article-preview-section__column')]
    return {
      columnCount: cols.length,
      titles: cols.map((c) => c.querySelector('.article-preview-section__column-title')?.textContent?.trim() ?? '(无标题元素)'),
      counts: cols.map((c) => c.querySelectorAll('.article-preview-card').length),
    }
  })
  console.log(JSON.stringify(info, null, 2))

  const expected = ['TRO 案件预警', 'TRO 成功案例', '劳动法案例', '货代案例']
  const missing = expected.filter((t) => !info.titles.includes(t))
  console.log('缺失标题:', JSON.stringify(missing))
} finally {
  await browser.close()
}
