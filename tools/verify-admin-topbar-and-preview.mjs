// 验证后台顶栏布局与文章列表的「预览内容」按钮。
// 1) 顶栏：账号/角色是否居左横向、退出按钮是否在最右且为按钮样式
// 2) 文章列表：是否存在「预览内容」按钮，点击后是否弹出预览弹层并渲染正文
import { mkdirSync, readFileSync } from 'node:fs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3002'
const outDir = process.env.CAPTURE_DIR ?? 'D:\\AppData\\admin-shots'
mkdirSync(outDir, { recursive: true })

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

  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(cookies)
  const page = await context.newPage()

  try {
    // ---------- 1) 顶栏布局
    await page.goto(`${base}/admin`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)

    const bar = await page.evaluate(() => {
      const topbar = document.querySelector('.admin-shell__topbar')
      const brand = document.querySelector('.admin-shell__brand')
      const account = document.querySelector('.admin-shell__account')
      const logout = document.querySelector('.admin-shell__logout')
      if (!topbar || !account || !logout) return { found: false }
      const r = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top) } }
      const style = getComputedStyle(logout)
      const accountStyle = getComputedStyle(account)
      return {
        found: true,
        brand: brand ? r(brand) : null,
        account: r(account),
        logout: r(logout),
        accountDirection: accountStyle.flexDirection,
        accountJustify: accountStyle.justifyContent,
        logoutBorderWidth: style.borderTopWidth,
        logoutBorderStyle: style.borderTopStyle,
        logoutPadding: style.paddingLeft,
        logoutBackground: style.backgroundColor,
        topbarWidth: Math.round(topbar.getBoundingClientRect().width),
        identityCount: account.querySelectorAll('.admin-shell__identity').length,
      }
    })
    console.log('  顶栏测量:', JSON.stringify(bar))
    check('顶栏元素齐全', bar.found === true)
    if (bar.found) {
      // 账号区块应贴在品牌右侧（左半侧），而不是被推到中间/右侧
      check('账号信息位于左侧（紧跟品牌）', bar.account.left < bar.topbarWidth / 2,
        `account.left=${bar.account.left} 半宽=${Math.round(bar.topbarWidth / 2)}`)
      check('账号与角色横向排列', bar.accountDirection === 'row' && bar.identityCount === 2,
        `direction=${bar.accountDirection} 条目数=${bar.identityCount}`)
      // 右侧有 topbar 自身的内边距（--space-6 = 24px，实际测量约 61px 视布局而定），
      // 因此判断「贴右」要留出这段内边距，而不是要求正好等于视口宽度。
      const rightGap = bar.topbarWidth - bar.logout.right
      check('退出按钮位于最右', rightGap >= 0 && rightGap <= 80 && bar.logout.left > bar.topbarWidth / 2,
        `右侧留白=${rightGap}px（应为内边距量级）`)
      check('退出按钮为可见按钮样式（有描边与内边距）',
        bar.logoutBorderStyle === 'solid' && parseFloat(bar.logoutBorderWidth) > 0 && parseFloat(bar.logoutPadding) > 4,
        `border=${bar.logoutBorderWidth}/${bar.logoutBorderStyle} padding=${bar.logoutPadding}`)
      check('账号信息在退出按钮左侧', bar.account.right <= bar.logout.left + 1,
        `account.right=${bar.account.right} logout.left=${bar.logout.left}`)
    }
    await page.screenshot({ path: `${outDir}\\topbar-left-account.png`, clip: { x: 0, y: 0, width: 1440, height: 110 } })

    // ---------- 2) 文章列表的预览按钮
    await page.goto(`${base}/admin/articles`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(3000)

    const previewButtons = await page.locator('button:has-text("预览内容")').count()
    check('文章列表存在「预览内容」按钮', previewButtons > 0, `数量=${previewButtons}`)

    if (previewButtons > 0) {
      await page.locator('button:has-text("预览内容")').first().click()
      // 等弹层出现且正文渲染完成（首次需请求详情）
      await page.waitForSelector('.admin-article-preview', { timeout: 15000 }).catch(() => {})
      await page.waitForFunction(
        () => {
          const dialog = document.querySelector('.admin-article-preview')
          if (!dialog) return false
          const status = dialog.querySelector('.admin-article-preview__status')
          return !status
        },
        null,
        { timeout: 20000 },
      ).catch(() => {})

      const dialog = await page.evaluate(() => {
        const el = document.querySelector('.admin-article-preview')
        if (!el) return { found: false }
        return {
          found: true,
          title: el.querySelector('h2')?.textContent?.trim() ?? '',
          meta: el.querySelector('.admin-article-preview__head span')?.textContent?.trim() ?? '',
          hasSummary: Boolean(el.querySelector('.admin-article-preview__summary')),
          bodyTextLength: (el.querySelector('.rich-article-body, article, div')?.textContent ?? '').trim().length,
          htmlLength: el.innerHTML.length,
        }
      })
      console.log('  预览弹层:', JSON.stringify(dialog))
      check('点击后弹出预览弹层', dialog.found === true)
      check('弹层显示文章标题', Boolean(dialog.title), dialog.title)
      check('弹层渲染了正文内容', dialog.htmlLength > 400, `innerHTML=${dialog.htmlLength}`)
      await page.screenshot({ path: `${outDir}\\article-list-preview.png` })

      // Esc 关闭
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      const closed = await page.evaluate(() => !document.querySelector('.admin-article-preview'))
      check('Esc 可关闭预览弹层', closed)
    }
  } finally {
    await browser.close()
  }

  const passed = results.filter(Boolean).length
  console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
  process.exitCode = passed === results.length ? 0 : 1
}
