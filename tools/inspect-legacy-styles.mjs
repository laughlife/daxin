import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

const PROPS = [
  'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor',
  'textAlign', 'textTransform', 'borderRadius', 'padding', 'margin', 'border', 'borderLeft',
  'width', 'height', 'display', 'gap', 'boxShadow', 'borderTop', 'borderBottom',
]

try {
  await page.goto('http://yan1.qinianyun.com/about/', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)

  const result = await page.evaluate((props) => {
    /** 取元素的计算样式快照（只保留关心的属性） */
    function snapshot(el) {
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = {}
      for (const p of props) out[p] = cs[p]
      return out
    }
    /** 按文本找元素 */
    function byText(tag, text) {
      return [...document.querySelectorAll(tag)].find((el) => (el.textContent || '').trim() === text) || null
    }
    const data = {}

    // 英文副标题（TRO SUCCESS STORIES 等），含其装饰线
    const eyebrow = byText('h4', 'TRO success stories')
    data.eyebrow = snapshot(eyebrow)
    if (eyebrow) {
      data.eyebrowHTML = eyebrow.outerHTML.slice(0, 400)
      const parent = eyebrow.parentElement
      data.eyebrowParent = parent ? { cls: parent.className, ...snapshot(parent) } : null
    }

    // 中文区块标题
    const title = byText('h2', 'TRO 成功案例')
    data.title = snapshot(title)
    if (title) {
      data.titleHTML = title.outerHTML.slice(0, 300)
      const parent = title.parentElement
      data.titleParent = parent ? { cls: String(parent.className).slice(0, 80), ...snapshot(parent) } : null
    }

    // 「国内业务」红色横条
    const bar = [...document.querySelectorAll('h1,h2,h3,h4,h5,div,span')].find((el) => (el.textContent || '').trim() === '国内业务' && el.children.length === 0)
    data.redBar = snapshot(bar)
    if (bar) data.redBarHTML = bar.outerHTML.slice(0, 300)

    // 「Our Business 国内业务」小标题
    const sub = [...document.querySelectorAll('*')].find((el) => /Our Business/.test(el.textContent || '') && el.children.length <= 2)
    data.ourBusiness = snapshot(sub)
    if (sub) data.ourBusinessHTML = sub.outerHTML.slice(0, 400)

    // 业务项小标题（"国内非诉业务"）
    const groupTitle = [...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '国内非诉业务' && el.children.length === 0)
    data.groupTitle = snapshot(groupTitle)

    // 欢迎标签（红底白字）
    const welcome = [...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '欢迎您来访 大信法务' && el.children.length === 0)
    data.welcome = snapshot(welcome)
    if (welcome) data.welcomeHTML = welcome.outerHTML.slice(0, 300)

    // 公司名
    const company = byText('h2', '深圳市大信法务咨询有限公司')
    data.company = snapshot(company)

    // 正文段落
    const p = [...document.querySelectorAll('p')].find((el) => /大信法务团队为深耕跨境赛道/.test(el.textContent || ''))
    data.paragraph = snapshot(p)

    // 页面主体容器宽度
    const container = document.querySelector('.container, .elementor-container, main')
    data.container = container ? { cls: String(container.className).slice(0, 60), ...snapshot(container) } : null

    return data
  }, PROPS)

  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
