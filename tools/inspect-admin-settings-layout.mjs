// 诊断后台设置页结构化编辑器（普法干货 / 核心优势）的排版错乱：看容器与子项的实际布局。
import { readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const base = 'http://127.0.0.1:3002'

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
const login = await fetch(`${base}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password }),
})
const cookies = (login.headers.getSetCookie?.() ?? []).map((l) => {
  const [p] = l.split(';'); const i = p.indexOf('=')
  return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), url: base }
})

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
try {
  await page.goto(`${base}/admin/settings`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)
  await page.locator('button').filter({ hasText: /^首页内容$/ }).first().click()
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        selector: sel,
        tag: el.tagName,
        cls: el.className,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        width: Math.round(el.getBoundingClientRect().width),
      }
    }
    // 找出「正文」附近的 field 容器
    const labels = [...document.querySelectorAll('.admin-settings__field')]
    const target = labels.find((el) => /正文/.test(el.textContent ?? ''))
    const chain = []
    if (target) {
      let el = target
      while (el && el !== document.body) {
        const cs = getComputedStyle(el)
        chain.push({
          cls: el.className || el.tagName,
          display: cs.display,
          cols: cs.gridTemplateColumns,
          w: Math.round(el.getBoundingClientRect().width),
        })
        el = el.parentElement
      }
    }
    return {
      fields: labels.length,
      targetChain: chain,
      sample: pick('.admin-settings__field'),
    }
  })
  console.log(JSON.stringify(info, null, 2))
} finally {
  await browser.close()
}
