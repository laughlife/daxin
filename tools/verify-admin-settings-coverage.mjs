// 核对后台「站点设置」各页签是否包含本次新增/改动的配置入口。
import { readFileSync } from 'node:fs'

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
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
await context.addCookies(cookies)
const page = await context.newPage()

/** 点击页签并等待内容渲染（内容是按页签条件渲染的，必须先切换）。 */
async function openTab(label) {
  const tab = page.locator('button').filter({ hasText: new RegExp(`^${label}$`) }).first()
  await tab.click({ timeout: 15000 })
  await page.waitForTimeout(1500)
}

try {
  await page.goto(`${base}/admin/settings`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(3000)

  const baseInfo = await page.evaluate(() => ({
    inputs: document.querySelectorAll('input,select,textarea').length,
    falseDirty: document.body.innerText.includes('有未保存的修改'),
  }))
  check('整页加载后设置面板正常渲染（不是空白）', baseInfo.inputs > 50, `${baseInfo.inputs} 个控件`)
  check('刚打开时不会误报「有未保存的修改」', baseInfo.falseDirty === false)

  await openTab('首页内容')
  const homeTab = await page.evaluate(() => ({
    teamBg: document.body.innerText.includes('团队介绍背景图'),
    hero: document.body.innerText.includes('首屏标题图片') || document.body.innerText.includes('首屏眉题'),
  }))
  check('首页内容页签包含「团队介绍背景图」', homeTab.teamBg === true)
  check('首页内容页签仍保留首屏相关配置', homeTab.hero === true)

  await openTab('关于我们')
  const aboutTab = await page.evaluate(() => ({
    lecture: document.body.innerText.includes('企业宣讲图片'),
    partner: document.body.innerText.includes('合作伙伴 Logo'),
  }))
  check('关于我们页签包含「企业宣讲图片」入口', aboutTab.lecture === true)
  check('关于我们页签包含「合作伙伴 Logo」入口', aboutTab.partner === true)

  await openTab('团队业务范围')
  const services = await page.evaluate(() => {
    const text = document.body.innerText
    const wanted = ['TRO 业务', '知识产权服务', '涉外纠纷', '货代纠纷与劳动争议', '全周期法律护航']
    return wanted.filter((name) => text.includes(name))
  })
  check('「团队业务范围」显示需求文档的 5 个板块', services.length === 5, `匹配 ${services.length}/5: ${services.join('、')}`)

  // 二维码管理同样修了「整页加载后为空」的问题，这里一并回归。
  // 只断言可上传控件存在（不写死按钮文案，避免文案调整后误报）。
  await openTab('二维码管理')
  const qr = await page.evaluate(() => ({
    uploads: document.querySelectorAll('input[type="file"]').length,
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '').filter(Boolean),
  }))
  check('「二维码管理」整页加载后可上传图片', qr.uploads >= 4, `文件选择 ${qr.uploads} 个`)
  check('「二维码管理」存在保存按钮', qr.buttons.some((text) => text.includes('保存')), qr.buttons.filter((t) => t.includes('保存')).join(' / '))

  await page.screenshot({ path: `${outDir}\\admin-settings-fixed.png` })
} finally {
  await browser.close()
}

const passed = results.filter(Boolean).length
console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
process.exitCode = passed === results.length ? 0 : 1
