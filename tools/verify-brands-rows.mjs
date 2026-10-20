// 验证侵权品牌列表：「6 行」+「底部分页移出白框」。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/brands`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.brand-card', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.brand-card')]
    const rows = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))
    const nav = document.querySelector('.brand-directory__pagination')
    const list = document.querySelector('.brand-directory__list')
    const navInsideList = Boolean(nav && list && list.contains(nav))
    const navStyle = nav ? getComputedStyle(nav) : null
    const navRect = nav?.getBoundingClientRect()
    const listRect = list?.getBoundingClientRect()
    return {
      cardCount: cards.length,
      rowCount: rows.size,
      hasSizeSelect: Boolean(document.querySelector('.brand-directory__result-head select')),
      navInsideList,
      navBackground: navStyle?.backgroundColor ?? null,
      navTopVsListBottom: navRect && listRect ? Math.round(navRect.top - listRect.bottom) : null,
    }
  })
  console.log('  详情:', JSON.stringify(info))

  check('每页 12 个（2 列 × 6 行）', info.cardCount === 12, `实际 ${info.cardCount} 个`)
  check('正好 6 行', info.rowCount === 6, `实际 ${info.rowCount} 行`)
  check('已移除「每页 N 条」下拉', info.hasSizeSelect === false)
  check('分页条已移出白色面板', info.navInsideList === false)
  check('底部不再有白框包住分页', info.navBackground === 'rgba(0, 0, 0, 0)' && info.navTopVsListBottom !== null,
    `nav 背景=${info.navBackground} 距面板底部=${info.navTopVsListBottom}px`)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${outDir}\\brands-bottom-after.png` })
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
