import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

const PROPS = ['fontSize', 'fontWeight', 'color', 'backgroundColor', 'width', 'height',
  'borderTop', 'borderBottom', 'borderLeft', 'margin', 'padding', 'textAlign', 'borderRadius']

try {
  await page.goto('http://yan1.qinianyun.com/about/', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)

  const out = await page.evaluate((props) => {
    const snap = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const o = {}
      for (const p of props) o[p] = cs[p]
      return o
    }
    const res = {}

    // 英文副标题的装饰线：看它的 ::before / ::after 与所在 h4 自身
    const eyebrow = document.querySelector('h4.sub-title')
    if (eyebrow) {
      res.eyebrowClass = eyebrow.className
      res.eyebrowSelf = snap(eyebrow)
      const before = getComputedStyle(eyebrow, '::before')
      const after = getComputedStyle(eyebrow, '::after')
      res.eyebrowBefore = { content: before.content, width: before.width, height: before.height, backgroundColor: before.backgroundColor, position: before.position, display: before.display, top: before.top, left: before.left }
      res.eyebrowAfter = { content: after.content, width: after.width, height: after.height, backgroundColor: after.backgroundColor, display: after.display }
    }

    // 中文标题的上下装饰线（旧站 h2.title 常见上下短横线）
    const title = document.querySelector('h2.title')
    if (title) {
      res.titleClass = title.className
      const before = getComputedStyle(title, '::before')
      const after = getComputedStyle(title, '::after')
      res.titleBefore = { content: before.content, width: before.width, height: before.height, backgroundColor: before.backgroundColor, display: before.display, margin: before.margin }
      res.titleAfter = { content: after.content, width: after.width, height: after.height, backgroundColor: after.backgroundColor, display: after.display, margin: after.margin }
    }

    // 业务板块：找到含「国内业务」的祖先容器，取背景色（旧站为深红/近黑横条）
    const bizHeading = [...document.querySelectorAll('h1,h2,h3,h4,h5,span,div,a')]
      .find((el) => (el.textContent || '').trim() === '国内业务' && el.children.length === 0)
    if (bizHeading) {
      res.bizHeadingTag = bizHeading.tagName + '.' + bizHeading.className
      res.bizHeading = snap(bizHeading)
      let node = bizHeading
      const chain = []
      for (let i = 0; i < 5 && node; i += 1) {
        chain.push({ tag: node.tagName, cls: String(node.className).slice(0, 70), ...snap(node) })
        node = node.parentElement
      }
      res.bizHeadingChain = chain
    }

    // 业务项图标（旧站业务项是图片/图标）
    const iconImgs = [...document.querySelectorAll('img')].slice(0, 12).map((img) => ({
      src: img.currentSrc || img.src,
      w: img.width,
      h: img.height,
      alt: img.alt,
    }))
    res.images = iconImgs

    return res
  }, PROPS)

  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
