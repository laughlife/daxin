// 截取后台页面用于排查样式。
//
// 登录方式：直接调 /api/admin/login 拿会话 Cookie，再注入浏览器上下文。
// 为什么不用 Playwright 填表单登录：登录页的输入框选择器随实现变化，
// 一旦对不上就会「截出一张登录页」而误判成页面样式问题（本脚本第一版就踩了这个坑）。
// 走接口登录的可靠性不受前端 DOM 影响。
//
// 用法：node tools/capture-admin-page.mjs <路径> <输出文件> [视口宽度]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const targetPath = process.argv[2] ?? '/admin/sidebar'
const outFile = process.argv[3] ?? 'D:\\AppData\\admin-shots\\page.png'
const viewportWidth = Number(process.argv[4] ?? 1440)
mkdirSync(dirname(outFile), { recursive: true })

// ---- 1) 接口登录，取会话 Cookie
const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const loginResponse = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
  signal: AbortSignal.timeout(60000),
})
console.log(`登录 HTTP ${loginResponse.status}`)
if (loginResponse.status !== 200) {
  console.error('登录失败，无法继续截图')
  process.exitCode = 1
} else {
  const setCookies = loginResponse.headers.getSetCookie?.() ?? []
  const cookies = setCookies.map((raw) => {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), url: base }
  })
  console.log(`取得 Cookie ${cookies.length} 个: ${cookies.map((c) => c.name).join(', ')}`)

  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
  const context = await browser.newContext({ viewport: { width: viewportWidth, height: 1100 } })
  await context.addCookies(cookies)
  const page = await context.newPage()
  try {
    await page.goto(`${base}${targetPath}`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: outFile, fullPage: true })
    console.log(`已截图: ${outFile}`)

    const diag = await page.evaluate((path) => {
      const isLogin = location.pathname.includes('/login')
      const main = document.querySelector('main, .admin-layout__main, .site-shell__main')
      const table = document.querySelector('table')
      return {
        currentPath: location.pathname,
        redirectedToLogin: isLogin,
        documentWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflow: document.body.scrollWidth > window.innerWidth,
        mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
        tableWidth: table ? Math.round(table.getBoundingClientRect().width) : null,
        tableOverflow: table ? table.scrollWidth > table.clientWidth : false,
        requestedPath: path,
      }
    }, targetPath)
    console.log('布局诊断:', JSON.stringify(diag, null, 2))
  } finally {
    await browser.close()
  }
}
void writeFileSync
