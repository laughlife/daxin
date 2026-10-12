// 验证首屏动态背景已由 CSS 动画替换为配置的动图。
//
// 检查点：
//   1. 首屏元素带 home-hero--image-bg 类（说明走图片背景分支）；
//   2. 内联样式里出现动图地址（动画 WebP）与静帧回退；
//   3. 原来的 CSS 动态背景层（.home-hero__decor 光斑）不再渲染；
//   4. CSS 的 ::before/::after 在该模式下为 display:none（用浏览器计算样式确认）。
import { mkdirSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\hero-anim'
mkdirSync(outDir, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---- 服务端渲染层面
const html = await (await fetch(`${base}/`, { signal: AbortSignal.timeout(60000) })).text()
check('首屏带 image-bg 类', html.includes('home-hero--image-bg'))
check('内联样式含动图地址', html.includes('.webp'))
check('内联样式含静帧回退', html.includes('.jpg'))
check('不再渲染 CSS 光斑装饰', !html.includes('home-hero__orb'))

// ---- 浏览器渲染层面：确认原 CSS 背景层真的被关掉
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.home-hero', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const hero = document.querySelector('.home-hero')
    if (!hero) return { found: false }
    const before = getComputedStyle(hero, '::before')
    const after = getComputedStyle(hero, '::after')
    const self = getComputedStyle(hero)
    return {
      found: true,
      hasImageBgClass: hero.classList.contains('home-hero--image-bg'),
      backgroundImage: self.backgroundImage.slice(0, 200),
      backgroundSize: self.backgroundSize,
      beforeDisplay: before.display,
      afterDisplay: after.display,
      orbCount: document.querySelectorAll('.home-hero__orb').length,
      decorCount: document.querySelectorAll('.home-hero__decor').length,
    }
  })
  console.log('\n  计算样式:', JSON.stringify(info, null, 2))

  check('浏览器确认走图片背景', info.hasImageBgClass === true)
  check('内联背景图生效', String(info.backgroundImage).includes('url('), String(info.backgroundSize))
  check('::before 已关闭', info.beforeDisplay === 'none', `display=${info.beforeDisplay}`)
  check('::after 已关闭', info.afterDisplay === 'none', `display=${info.afterDisplay}`)
  check('光斑装饰未渲染', info.orbCount === 0 && info.decorCount === 0)

  const path = `${outDir}\\hero-with-config-bg.png`
  await page.locator('.home-hero').screenshot({ path })
  console.log(`\n  首屏截图: ${path}`)
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
