// 验证关于我们页的合作伙伴跑马灯是否已启用（logo 上传后自动切换）。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/about`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)

  const info = await page.evaluate(() => {
    const marquee = document.querySelector('.partner-marquee')
    const strip = document.querySelector('.partner-strip')
    if (!marquee) return { mode: strip ? 'fallback-strip' : 'none' }
    const track = marquee.querySelector('.partner-marquee__track')
    const cs = getComputedStyle(track)
    const img = marquee.querySelector('img')
    const lists = marquee.querySelectorAll('.partner-marquee__list')
    return {
      mode: 'marquee',
      lists: lists.length,
      logosPerList: lists[0] ? lists[0].querySelectorAll('img').length : 0,
      animation: cs.animationName,
      duration: cs.animationDuration,
      height: Math.round(marquee.getBoundingClientRect().height),
      filter: getComputedStyle(img).filter,
      loading: [...marquee.querySelectorAll('img')].filter((el) => el.complete && el.naturalWidth > 0).length,
    }
  })
  console.log(JSON.stringify(info))

  const section = page.locator('section[aria-label="我们的小伙伴"]')
  await section.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(600)
  await section.screenshot({ path: `${outDir}\\partner-marquee-live.png` }).catch(() => {})
} finally {
  await browser.close()
}
