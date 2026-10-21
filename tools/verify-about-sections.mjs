// 验证关于我们：企业宣讲 4×2 轮播、合作伙伴三行彩色跑马灯（或兜底）。
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
  await page.goto(`${base}/about`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(1500)

  // ---------- 企业宣讲 4×2
  const lecture = await page.evaluate(() => {
    const grid = document.querySelector('.presentation-carousel__grid')
    if (!grid) return { found: false }
    const items = [...grid.querySelectorAll('li')]
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    const rows = new Set(items.map((li) => Math.round(li.getBoundingClientRect().top))).size
    return {
      found: true,
      items: items.length,
      cols,
      rows,
      hasControls: Boolean(document.querySelector('.presentation-carousel__controls')),
      dotCount: document.querySelectorAll('.presentation-carousel__dots button').length,
      firstSrc: items[0]?.querySelector('img')?.getAttribute('src') ?? '',
      // 旧的全铺开结构应已不存在
      oldGallery: Boolean(document.querySelector('.about-page__gallery')),
    }
  })
  console.log('  企业宣讲:', JSON.stringify(lecture))
  check('企业宣讲区块存在', lecture.found === true)
  check('一屏 4 列 × 2 行 = 8 个展示位', lecture.cols === 4 && lecture.rows === 2 && lecture.items === 8,
    `列=${lecture.cols} 行=${lecture.rows} 项=${lecture.items}`)
  check('提供轮播控件与分页圆点', lecture.hasControls === true && lecture.dotCount >= 2, `圆点 ${lecture.dotCount} 个`)
  check('旧的全铺开网格已移除', lecture.oldGallery === false)

  // 轮播能真正切换
  const before = lecture.firstSrc
  await page.locator('.presentation-carousel__controls > button').last().click()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() =>
    document.querySelector('.presentation-carousel__grid li img')?.getAttribute('src') ?? '')
  check('点击下一组可切换图片', after !== before, `${before.split('/').pop()} → ${after.split('/').pop()}`)

  // ---------- 合作伙伴
  const partner = await page.evaluate(() => {
    const marquee = document.querySelector('.partner-marquee')
    const strip = document.querySelector('.partner-strip')
    if (marquee) {
      const track = marquee.querySelector('.partner-marquee__track')
      const rows = [...marquee.querySelectorAll('.partner-marquee__row')]
      const listsPerRow = rows.map(row => row.querySelectorAll('.partner-marquee__list').length)
      const firstImg = marquee.querySelector('img')
      return {
        mode: 'marquee',
        rows: rows.length,
        listsPerRow,
        animation: getComputedStyle(track).animationName,
        duration: getComputedStyle(track).animationDuration,
        height: Math.round(marquee.getBoundingClientRect().height),
        filter: getComputedStyle(firstImg).filter,
        tileSizes: [...new Set([...marquee.querySelectorAll('.partner-marquee__list li')]
          .map(item => {
            const rect = item.getBoundingClientRect()
            return `${Math.round(rect.width)}x${Math.round(rect.height)}`
          }))],
        tileRadius: getComputedStyle(marquee.querySelector('.partner-marquee__list li')).borderRadius,
        logoFrames: [...new Set([...marquee.querySelectorAll('.partner-marquee__list img')]
          .map(img => {
            const rect = img.getBoundingClientRect()
            return `${Math.round(rect.width)}x${Math.round(rect.height)}`
          }))],
        logoBlend: getComputedStyle(firstImg).mixBlendMode,
      }
    }
    return { mode: strip ? 'fallback-strip' : 'none' }
  })
  console.log('  合作伙伴:', JSON.stringify(partner))

  if (partner.mode === 'marquee') {
    check('合作伙伴分为三行跑马灯', partner.rows === 3, `行数 ${partner.rows}`)
    check('每行复制列表形成无缝循环', partner.listsPerRow.length === 3 && partner.listsPerRow.every(count => count === 2), JSON.stringify(partner.listsPerRow))
    check('跑马灯动画生效', partner.animation !== 'none', `${partner.animation} ${partner.duration}`)
    check('LOGO 保持彩色', partner.filter === 'none', partner.filter)
    check('统一椭圆底座尺寸', partner.tileSizes.length === 1 && partner.tileRadius === '999px',
      `${partner.tileSizes.join(', ')} / 圆角 ${partner.tileRadius}`)
    check('LOGO 统一放大显示尺寸', partner.logoFrames.length === 1, partner.logoFrames.join(', '))
    check('白底 LOGO 与椭圆底座融合', partner.logoBlend === 'multiply', partner.logoBlend)

    await page.locator('.partner-marquee__row').first().hover()
    await page.waitForTimeout(150)
    const pauseState = await page.locator('.partner-marquee__track').evaluate(el => getComputedStyle(el).animationPlayState)
    check('悬停时暂停轮播', pauseState === 'paused', pauseState)

    await page.locator('.partner-marquee__list li').first().hover()
    await page.waitForTimeout(220)
    const hoveredTransform = await page.locator('.partner-marquee__list li img').first().evaluate(el => getComputedStyle(el).transform)
    check('悬停 Logo 轻微放大', hoveredTransform !== 'none', hoveredTransform)

    await page.mouse.move(0, 0)
    await page.waitForTimeout(100)
    const resumeState = await page.locator('.partner-marquee__track').first().evaluate(el => getComputedStyle(el).animationPlayState)
    check('移开后恢复轮播', resumeState === 'running', resumeState)
  } else {
    console.log('  ⚠ 当前是兜底形态：缺少单独 logo 素材，跑马灯未启用')
  }

  const section = page.locator('section[aria-label="我们的小伙伴"]')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await section.screenshot({ path: `${outDir}\\partner-marquee.png` }).catch(() => {})

  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.locator('.partner-marquee').evaluate(el => ({
    visibleWidth: Math.round(el.getBoundingClientRect().width),
    viewportWidth: window.innerWidth,
    rowCount: el.querySelectorAll('.partner-marquee__row').length,
  })).catch(() => null)
  if (mobile) check('窄屏仍显示三行且容器不超出视口', mobile.rowCount === 3 && mobile.visibleWidth <= mobile.viewportWidth, JSON.stringify(mobile))
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
