// 验证首页「核心业务」01-05 面板：横向排列、悬停展开、点击固定、内容与背景变化。
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'
mkdirSync(outDir, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.core-business__panel', { timeout: 30000 })

  const layout = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.core-business__panel')]
    const rects = panels.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) }
    })
    const titles = panels.map((el) => el.querySelector('.core-business__title')?.textContent?.trim() ?? '')
    const indices = panels.map((el) => el.querySelector('.core-business__index')?.textContent?.trim() ?? '')
    return { count: panels.length, rects, titles, indices }
  })

  console.log('  面板:', JSON.stringify(layout))
  check('核心业务有 5 个面板', layout.count === 5, `实际 ${layout.count}`)
  check('序号为 01-05', layout.indices.join(',') === '01,02,03,04,05', layout.indices.join(','))
  // 横向排列：所有面板 top 相同
  const sameTop = new Set(layout.rects.map((r) => r.top)).size === 1
  check('01-05 横向排列（同一行）', sameTop)
  check('收起态宽度接近均分', layout.rects.every((r) => Math.abs(r.width - layout.rects[0].width) <= 2))

  // ---- 悬停展开
  const firstPanel = page.locator('.core-business__panel').first()
  const before = await page.evaluate(() => {
    const p = document.querySelector('.core-business__panel')
    return {
      width: Math.round(p.getBoundingClientRect().width),
      bg: getComputedStyle(p).backgroundColor,
      bodyHeight: Math.round(p.querySelector('.core-business__body').getBoundingClientRect().height),
      expanded: p.querySelector('button')?.getAttribute('aria-expanded'),
    }
  })
  await firstPanel.hover()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const p = document.querySelector('.core-business__panel')
    return {
      width: Math.round(p.getBoundingClientRect().width),
      bg: getComputedStyle(p).backgroundColor,
      bodyHeight: Math.round(p.querySelector('.core-business__body').getBoundingClientRect().height),
      expanded: p.querySelector('button')?.getAttribute('aria-expanded'),
      itemCount: p.querySelectorAll('.core-business__items li').length,
      desc: p.querySelector('.core-business__description')?.textContent?.trim() ?? '',
    }
  })
  console.log('  悬停前:', JSON.stringify(before))
  console.log('  悬停后:', JSON.stringify(after))

  check('收起态内容区高度归零（不留空白）', before.bodyHeight <= 2, `收起高度 ${before.bodyHeight}px`)
  check('悬停后面板变宽', after.width > before.width, `${before.width} → ${after.width}`)
  check('悬停后背景色变化', after.bg !== before.bg, `${before.bg} → ${after.bg}`)
  check('悬停后内容区展开', after.bodyHeight > before.bodyHeight + 10, `${before.bodyHeight} → ${after.bodyHeight}`)
  check('展开后 aria-expanded=true', after.expanded === 'true')
  check('展开后显示细项', after.itemCount > 0, `细项 ${after.itemCount} 条`)
  check('展开后显示说明文字', after.desc.length > 0, after.desc.slice(0, 30))

  await page.screenshot({ path: `${outDir}\\core-business-hover.png`, clip: await page.evaluate(() => {
    const el = document.querySelector('.core-business')
    const r = el.getBoundingClientRect()
    return { x: 0, y: Math.max(0, r.top + window.scrollY), width: 1440, height: Math.min(700, r.height) }
  }).then((r) => ({ x: 0, y: 0, width: 1440, height: 900 })) })

  // ---- 点击固定：移开鼠标后仍保持展开
  const secondToggle = page.locator('.core-business__toggle').nth(1)
  await secondToggle.click()
  await page.mouse.move(10, 10)
  await page.waitForTimeout(600)
  const pinned = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.core-business__panel')]
    const active = panels.findIndex((p) => p.classList.contains('core-business__panel--active'))
    return { active, expanded: panels[1].querySelector('button')?.getAttribute('aria-expanded') }
  })
  check('点击后固定展开（移开鼠标仍展开）', pinned.active === 1 && pinned.expanded === 'true', JSON.stringify(pinned))

  // ---- 再次点击收起
  await secondToggle.click()
  await page.waitForTimeout(600)
  const collapsed = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.core-business__panel')]
    return panels.some((p) => p.classList.contains('core-business__panel--active'))
  })
  check('再次点击可收起', collapsed === false)

  // ---- 团队介绍：背景图区块 + 左侧介绍
  const intro = await page.evaluate(() => {
    const el = document.querySelector('.home-team-intro')
    if (!el) return { found: false }
    const content = el.querySelector('.home-team-intro__content')
    const r = el.getBoundingClientRect()
    const c = content.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      found: true,
      hasContent: Boolean(content),
      contentLeftRatio: Number(((c.left - r.left) / r.width).toFixed(2)),
      bgImage: style.backgroundImage.slice(0, 40),
      color: style.color,
      paragraphCount: el.querySelectorAll('.home-team-intro__paragraph').length,
      hasOldFourBlocks: Boolean(document.querySelector('.home-team-services__card')),
      sectionsOrder: [...document.querySelectorAll('main section, main > div > section')]
        .map((s) => s.className.split(' ')[0]).slice(0, 6),
    }
  })
  console.log('  团队介绍:', JSON.stringify(intro))
  check('团队介绍区块存在', intro.found === true)
  check('介绍内容位于左侧', intro.contentLeftRatio <= 0.2, `左侧占比 ${intro.contentLeftRatio}`)
  check('团队介绍内不再有四个业务块', intro.hasOldFourBlocks === false)

  await page.screenshot({ path: `${outDir}\\home-team-intro.png` })
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
