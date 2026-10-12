// 复现用户报告的完整路径：侧边栏管理 → 点「编辑内容」→ 跳到文章管理 → 应定位到表单。
//
// 关键点：这条路径是**客户端路由跳转**，不是直接打开 URL，
// 因此能覆盖「onMounted 在客户端跳转时不触发」这类只在真实操作中暴露的问题。
import { readFileSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await fetch(`${base}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
  signal: AbortSignal.timeout(60000),
})
if (login.status !== 200) {
  console.error(`登录失败 HTTP ${login.status}`)
  process.exitCode = 1
} else {
  const cookies = (login.headers.getSetCookie?.() ?? []).map((raw) => {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), url: base }
  })
  const adminCookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  // 侧边栏当前可能没有文章，先临时把一篇文章标记为侧边栏显示，测试后还原
  const listResponse = await fetch(`${base}/api/admin/articles?pageSize=1`, {
    headers: { cookie: adminCookie }, signal: AbortSignal.timeout(30000),
  })
  const article = (await listResponse.json())?.data?.[0]
  console.log(`取一篇文章用于测试: id=${article?.id} 「${article?.title?.slice(0, 24)}」`)

  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(cookies)
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.text().includes('[scroll]')) console.log('    ' + msg.text())
  })
  page.on('pageerror', (err) => console.log('    [pageerror] ' + err.message))

  try {
    if (article) {
      await fetch(`${base}/api/admin/articles/${article.id}`, {
        method: 'PUT',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ showInSidebar: true }),
        signal: AbortSignal.timeout(30000),
      })

      await page.goto(`${base}/admin/sidebar`, { waitUntil: 'networkidle', timeout: 120000 })
      await page.waitForTimeout(2500)

      const linkCount = await page.locator('a:has-text("编辑内容")').count()
      check('侧边栏列表出现「编辑内容」链接', linkCount > 0, `count=${linkCount}`)

      if (linkCount > 0) {
        await page.locator('a:has-text("编辑内容")').first().click()

        /*
         * 等滚动真正完成再断言。
         *
         * 不能只 sleep 固定时间：滚动链路里包含「等表单元素出现」（可能数百毫秒到数秒）
         * 与平滑滚动动画本身，固定等待很容易在动画中途取样而误判成失败。
         * 这里轮询到表单进入视口并稳定为止（最多 15 秒）。
         */
        await page.waitForFunction(
          () => {
            const editor = document.querySelector('.admin-articles__editor')
            if (!editor) return false
            const rect = editor.getBoundingClientRect()
            return rect.top < window.innerHeight && rect.bottom > 0
          },
          null,
          { timeout: 15000 },
        ).catch(() => {})

        const after = await page.evaluate(() => {
          const editor = document.querySelector('.admin-articles__editor')
          const rect = editor?.getBoundingClientRect()
          return {
            path: location.pathname + location.search,
            editorFound: Boolean(editor),
            inViewport: rect ? rect.top < window.innerHeight && rect.bottom > 0 : false,
            top: rect ? Math.round(rect.top) : null,
            scrollY: Math.round(window.scrollY),
          }
        })
        check('跳转到文章管理页', after.path.startsWith('/admin/articles'), after.path)
        check('表单已渲染', after.editorFound)
        check('表单已滚入视口（核心诉求）', after.inViewport, JSON.stringify(after))
      }

      // 还原：取消侧边栏标记
      await fetch(`${base}/api/admin/articles/${article.id}`, {
        method: 'PUT',
        headers: { cookie: adminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ showInSidebar: false }),
        signal: AbortSignal.timeout(30000),
      })
      console.log('  已还原该文章的侧边栏标记')
    }
  } finally {
    await browser.close()
  }

  const passed = results.filter(Boolean).length
  console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
  process.exitCode = passed === results.length ? 0 : 1
}
