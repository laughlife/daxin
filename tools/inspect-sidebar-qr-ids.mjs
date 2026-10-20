// 分别统计「侧栏内」与「整页」渲染的 [data-qr-id]，用于区分
// 「侧栏二维码错配」与「页脚二维码也被计入」这两种情况。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  for (const path of ['/faq/cross-border', '/faq/labor', '/tro/alerts', '/domestic/labor-disputes']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(1200)
    const info = await page.evaluate(() => {
      const ids = (root) => [...root.querySelectorAll('[data-qr-id]')].map((el) => el.getAttribute('data-qr-id'))
      const sidebar = document.querySelector('.content-sidebar')
      const footer = document.querySelector('footer')
      return {
        sidebar: sidebar ? ids(sidebar) : null,
        footer: footer ? ids(footer) : null,
        page: ids(document),
      }
    })
    console.log(path.padEnd(26), '侧栏=' + JSON.stringify(info.sidebar), ' 页脚=' + JSON.stringify(info.footer))
  }
} finally {
  await browser.close()
}
