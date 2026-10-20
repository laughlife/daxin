// 验证关于我们：企业宣讲 4×2 轮播、合作伙伴跑马灯（或兜底）。
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
      const lists = marquee.querySelectorAll('.partner-marquee__list')
      const firstImg = marquee.querySelector('img')
      return {
        mode: 'marquee',
        lists: lists.length,
        animation: getComputedStyle(track).animationName,
        duration: getComputedStyle(track).animationDuration,
        height: Math.round(marquee.getBoundingClientRect().height),
        grayscale: getComputedStyle(firstImg).filter,
      }
    }
    return { mode: strip ? 'fallback-strip' : 'none' }
  })
  console.log('  合作伙伴:', JSON.stringify(partner))

  if (partner.mode === 'marquee') {
    check('合作伙伴为跑马灯（列表复制一份用于无缝循环）', partner.lists === 2, `列表 ${partner.lists} 份`)
    check('跑马灯动画生效', partner.animation !== 'none', `${partner.animation} ${partner.duration}`)
    check('区域高度受控（≤180px）', partner.height <= 180, `${partner.height}px`)
    check('LOGO 默认灰度', /grayscale/.test(partner.grayscale), partner.grayscale)
  } else {
    console.log('  ⚠ 当前是兜底形态：缺少单独 logo 素材，跑马灯未启用')
  }

  const section = page.locator('section[aria-label="企业宣讲"]')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await section.screenshot({ path: `${outDir}\\about-lecture.png` }).catch(() => {})
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
