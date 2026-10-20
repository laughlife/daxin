// 截取侵权品牌列表顶部分类标签，确认「商标/版权/专利」三色区分且激活态仍为实色。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${base}/brands`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.brand-directory__tabs button', { timeout: 30000 })
  await page.waitForTimeout(1000)

  const styles = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.brand-directory__tabs button')]
    return tabs.map((t) => ({
      type: t.getAttribute('data-type'),
      label: t.querySelector('span')?.textContent?.trim(),
      color: getComputedStyle(t).color,
      background: getComputedStyle(t).backgroundColor,
      active: t.classList.contains('is-active'),
    }))
  })
  for (const s of styles) console.log(' ', JSON.stringify(s))

  const colored = styles.filter((s) => ['trademark', 'copyright', 'patent'].includes(s.type))
  const distinct = new Set(colored.map((s) => s.color)).size
  console.log(`\n三色区分: ${distinct} 种颜色`)
  console.log('激活态仍有实色背景:', styles.some((s) => s.active && s.background !== 'rgba(0, 0, 0, 0)'))

  const box = await page.locator('.brand-directory__panel').boundingBox()
  await page.screenshot({
    path: `${outDir}\\brands-tabs.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 260) },
  })
} finally {
  await browser.close()
}
