import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
try {
  await page.goto('http://yan1.qinianyun.com/about/', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)
  // 整页截图，便于比对模块顺序与卡片样式
  const path = 'D:\\AppData\\legacy-assets\\legacy-about-full.png'
  await page.screenshot({ path, fullPage: true })
  console.log('整页截图:', path)

  // 记录主要区块的顺序与标题，作为结构比对的依据
  const outline = await page.evaluate(() => {
    const nodes = document.querySelectorAll('h1, h2, h3, h4, section, .elementor-section, .elementor-widget-image')
    const out = []
    for (const node of nodes) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (!text && !node.className) continue
      out.push(`${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]} :: ${text}`)
    }
    return out
  })
  console.log('\n结构大纲:')
  for (const line of outline.slice(0, 60)) console.log('  ' + line)
  writeFileSync('D:\\AppData\\legacy-assets\\legacy-about-outline.txt', outline.join('\n'))
} finally {
  await browser.close()
}
