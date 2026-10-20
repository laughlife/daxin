// 验证「核心优势」水印背景与展开配色过渡、「普法干货」图文比例。
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'
mkdirSync(outDir, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-core-advantages__card', { timeout: 30000 })
  await page.waitForTimeout(800)

  // ---------- 核心优势 ①标题与内容之间留白
  const spacing = await page.evaluate(() => {
    const section = document.querySelector('.home-core-advantages')
    const heading = section.querySelector('.section-heading')
    const grid = section.querySelector('.home-core-advantages__grid')
    if (!heading || !grid) return null
    return Math.round(grid.getBoundingClientRect().top - heading.getBoundingClientRect().bottom)
  })
  check('核心优势标题与内容之间留出空行', spacing !== null && spacing >= 24, `间距 ${spacing}px`)

  // ---------- ② 淡图标水印存在且低透明度
  const watermark = await page.evaluate(() => {
    const card = document.querySelector('.home-core-advantages__card')
    const wm = card.querySelector('.home-core-advantages__watermark')
    if (!wm) return null
    const img = wm.querySelector('img')
    return {
      exists: true,
      opacity: Number(getComputedStyle(wm).opacity),
      hasImage: Boolean(img?.getAttribute('src')),
      ariaHidden: wm.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(wm).pointerEvents,
    }
  })
  console.log('  水印:', JSON.stringify(watermark))
  check('每个板块带图标水印', watermark?.exists === true && watermark.hasImage)
  check('水印为低透明度（不干扰阅读）', watermark && watermark.opacity > 0 && watermark.opacity <= 0.15, `opacity=${watermark?.opacity}`)
  check('水印不参与交互且对读屏隐藏', watermark?.ariaHidden === 'true' && watermark?.pointerEvents === 'none')

  // ---------- ③ 展开时背景从淡水印过渡到带色背景
  const before = await page.evaluate(() => {
    const card = document.querySelector('.home-core-advantages__card')
    const wm = card.querySelector('.home-core-advantages__watermark')
    return { bg: getComputedStyle(card).backgroundColor, opacity: Number(getComputedStyle(wm).opacity) }
  })
  await page.locator('.home-core-advantages__card').first().hover()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const card = document.querySelector('.home-core-advantages__card')
    const wm = card.querySelector('.home-core-advantages__watermark')
    return {
      bg: getComputedStyle(card).backgroundColor,
      opacity: Number(getComputedStyle(wm).opacity),
      expanded: card.querySelector('button')?.getAttribute('aria-expanded'),
    }
  })
  console.log('  展开前:', JSON.stringify(before), '展开后:', JSON.stringify(after))
  check('展开后卡片背景变为带色底', after.bg !== before.bg, `${before.bg} → ${after.bg}`)
  check('展开后水印加深', after.opacity > before.opacity, `${before.opacity} → ${after.opacity}`)
  check('展开态 aria-expanded=true', after.expanded === 'true')

  await page.locator('.home-core-advantages').screenshot({ path: `${outDir}\\core-advantages.png` })

  // ---------- 普法干货：外框压矮 + 图片放大
  const guides = await page.evaluate(() => {
    const panel = document.querySelector('.home-legal-guides__panel--active')
    if (!panel) return null
    const img = panel.querySelector('.home-legal-guides__image img')
    const r = panel.getBoundingClientRect()
    const ir = img?.getBoundingClientRect()
    const style = getComputedStyle(img)
    return {
      panelHeight: Math.round(r.height),
      imageRenderedHeight: ir ? Math.round(ir.height) : 0,
      imageRenderedWidth: ir ? Math.round(ir.width) : 0,
      transform: style.transform,
      accent: getComputedStyle(panel).getPropertyValue('--guide-accent').trim(),
    }
  })
  console.log('  普法干货:', JSON.stringify(guides))
  // 原高度 479px（由内容撑高，min-height 不生效）；收紧标题/二维码/内边距后应明显下降
  check('普法干货外框已压矮', guides && guides.panelHeight < 479 && guides.panelHeight <= 450, `高度 ${guides?.panelHeight}px（原 479px）`)
  // 放大靠裁掉素材透明边距实现，而不是 transform（否则会裁到书本本身）
  check('书籍图片未被 transform 裁切', guides && guides.transform === 'none', `transform=${guides?.transform}`)
  check('书籍图片填满容器高度（视觉放大）', guides && guides.imageRenderedHeight >= guides.panelHeight - 10, `图 ${guides?.imageRenderedHeight}px / 框 ${guides?.panelHeight}px`)
  check('兜底强调色跟随主题（不再是硬编码蓝）', guides && !/^#216695/i.test(guides.accent), `--guide-accent=${guides?.accent}`)

  await page.locator('.home-legal-guides').screenshot({ path: `${outDir}\\legal-guides.png` })
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
