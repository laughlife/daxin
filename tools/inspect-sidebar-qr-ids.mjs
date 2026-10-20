// 检查 /faq/cross-border 侧栏实际渲染的二维码组，判断 browser-check 的断言是否过期。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  for (const path of ['/faq/cross-border', '/faq/labor', '/tro/alerts', '/domestic/labor-disputes']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(1200)
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[data-qr-id]')].map((el) => el.getAttribute('data-qr-id')))
    console.log(path.padEnd(26), JSON.stringify(ids))
  }
} finally {
  await browser.close()
}
