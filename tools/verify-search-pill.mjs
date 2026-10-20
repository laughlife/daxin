// 验证三处搜索框已统一为胶囊样式（放大镜 + 输入 + 金色搜索按钮）。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  const targets = [
    ['TRO 业务', '/tro/cases'],
    ['国内业务', '/domestic/labor-disputes'],
    ['常见问题', '/faq/labor'],
  ]

  for (const [label, path] of targets) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(1200)

    const pill = await page.evaluate(() => {
      const form = document.querySelector('.search-pill')
      if (!form) return { found: false }
      const control = form.querySelector('.search-pill__control')
      const input = form.querySelector('.search-pill__input')
      const submit = form.querySelector('.search-pill__submit')
      const icon = form.querySelector('.search-pill__icon')
      const cs = getComputedStyle(control)
      const bs = getComputedStyle(submit)
      return {
        found: true,
        radius: cs.borderRadius,
        height: Math.round(control.getBoundingClientRect().height),
        hasIcon: Boolean(icon),
        submitLabel: submit?.textContent?.trim(),
        submitBg: bs.backgroundColor,
        inputTag: input?.tagName,
        // 搜索按钮是否贴在胶囊右端
        submitRightGap: Math.round(control.getBoundingClientRect().right - submit.getBoundingClientRect().right),
      }
    })

    console.log(`  ${label}（${path}）:`, JSON.stringify(pill))
    check(`${label} 使用胶囊搜索框`, pill.found === true)
    if (pill.found) {
      check(`${label} 为全圆角胶囊`, parseFloat(pill.radius) >= 20, `radius=${pill.radius}`)
      check(`${label} 左侧有放大镜图标`, pill.hasIcon === true)
      check(`${label} 有关联搜索按钮`, pill.submitLabel === '搜索', `按钮=${pill.submitLabel}`)
      check(`${label} 按钮为金色实底`, pill.submitBg === 'rgb(143, 95, 24)', pill.submitBg)
      check(`${label} 按钮贴合右端`, pill.submitRightGap <= 6, `右侧留白 ${pill.submitRightGap}px`)
    }
  }

  await page.goto(`${base}/tro/cases`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(1000)
  const box = await page.locator('.case-search-panel').boundingBox()
  if (box) {
    await page.screenshot({
      path: `${outDir}\\search-pill-tro.png`,
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 260) },
    })
  }
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
