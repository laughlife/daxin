// 核对后台「站点设置」是否已包含本次新增/改动的配置项。
const { readFileSync } = await import('node:fs')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\theme-shots'

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
})
const cookies = (login.headers.getSetCookie?.() ?? []).map((raw) => {
  const [pair] = raw.split(';')
  const eq = pair.indexOf('=')
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), url: base }
})

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.context().addCookies(cookies)
  await page.goto(`${base}/admin/settings`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)

  const homeTab = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasTeamBackground: text.includes('团队介绍背景图'),
      hasTheme: text.includes('公开页面配色'),
    }
  })
  check('首页内容页签包含「团队介绍背景图」', homeTab.hasTeamBackground === true)
  check('站点信息页签包含「公开页面配色」主题选择', homeTab.hasTheme === true)

  // 切到「关于我们」页签，核对两个独立模块的图片入口
  await page.getByRole('button', { name: '关于我们', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  const aboutTab = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasLecture: text.includes('企业宣讲图片'),
      hasPartner: text.includes('合作伙伴 Logo'),
    }
  })
  check('关于我们页签包含「企业宣讲图片」入口', aboutTab.hasLecture === true)
  check('关于我们页签包含「合作伙伴 Logo」入口', aboutTab.hasPartner === true)

  // 核心业务的编辑入口（团队业务范围）
  await page.goto(`${base}/admin/settings?tab=services`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2000)
  const services = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasFiveSections: ['TRO 业务', '知识产权服务', '涉外纠纷', '货代纠纷与劳动争议', '全周期法律护航']
        .filter((name) => text.includes(name)).length,
    }
  })
  check('「团队业务范围」显示 5 个板块且文案为新需求内容', services.hasFiveSections === 5, `匹配 ${services.hasFiveSections}/5`)

  await page.screenshot({ path: `${outDir}\\admin-settings-services.png` })
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
