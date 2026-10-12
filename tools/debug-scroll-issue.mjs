// 诊断：从侧边栏跳到 /admin/articles?id=N 后，滚动为什么没生效。
// 打印关键中间状态，不做断言。
import { readFileSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
  signal: AbortSignal.timeout(60000),
})
const cookies = (login.headers.getSetCookie?.() ?? []).map((raw) => {
  const [pair] = raw.split(';')
  const eq = pair.indexOf('=')
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), url: base }
})
const adminCookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

const list = await (await fetch(`${base}/api/admin/articles?pageSize=1`, {
  headers: { cookie: adminCookie }, signal: AbortSignal.timeout(30000),
})).json()
const id = list?.data?.[0]?.id

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies(cookies)
const page = await context.newPage()

// 收集页面内的 console 与错误
const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`))

try {
  await page.goto(`${base}/admin/articles?id=${id}`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(5000)

  const diag = await page.evaluate(() => {
    const editor = document.querySelector('.admin-articles__editor')
    const scrollingElement = document.scrollingElement
    return {
      hasEditor: Boolean(editor),
      editorTop: editor ? Math.round(editor.getBoundingClientRect().top) : null,
      scrollY: Math.round(window.scrollY),
      documentScrollTop: scrollingElement ? Math.round(scrollingElement.scrollTop) : null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyHeight: document.body.scrollHeight,
      canScroll: document.body.scrollHeight > window.innerHeight,
      editorRefAttached: Boolean(document.querySelector('.admin-articles__editor')),
      scrollIntoViewIsFunction: typeof (editor?.scrollIntoView) === 'function',
    }
  })
  console.log('诊断:')
  console.log(JSON.stringify(diag, null, 2))

  // 手动调用 scrollIntoView，看看能不能滚
  const manual = await page.evaluate(() => {
    const editor = document.querySelector('.admin-articles__editor')
    if (!editor) return null
    editor.scrollIntoView({ block: 'start' })
    return { afterScrollY: Math.round(window.scrollY), afterTop: Math.round(editor.getBoundingClientRect().top) }
  })
  console.log('手动 scrollIntoView 结果:', JSON.stringify(manual))

  await page.waitForTimeout(1000)
  const afterWait = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    top: Math.round(document.querySelector('.admin-articles__editor')?.getBoundingClientRect().top ?? -1),
  }))
  console.log('等待 1s 后:', JSON.stringify(afterWait))

  console.log('\n页面日志:')
  for (const line of logs.slice(-15)) console.log('  ' + line)
} finally {
  await browser.close()
}
