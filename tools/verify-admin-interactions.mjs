// 验证后台交互修复（真实浏览器）：
//   1. 文章管理点「编辑」后，编辑表单滚入视口；
//   2. 侧边栏管理样式正常（内容有左右留白、不贴边）；
//   3. 案例管理表单不再有「受理法院」字段；
//   4. 涉案品牌可输入搜索；搜不到时能「直接用输入的品牌新建」并关联。
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

// 接口登录并注入 Cookie（比填表单可靠）
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
    // ---------- 1) 文章管理：点编辑后表单进入视口
    await page.goto(`${base}/admin/articles`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)

    const editButton = page.locator('button:has-text("编辑")').first()
    if (await editButton.count() === 0) {
      check('文章列表存在编辑按钮', false, '页面上找不到「编辑」按钮')
    } else {
      await editButton.click()
      await page.waitForTimeout(2500)
      const articleScroll = await page.evaluate(() => {
        const editor = document.querySelector('.admin-articles__editor')
        if (!editor) return { found: false }
        const rect = editor.getBoundingClientRect()
        return {
          found: true,
          // 表单顶部落在视口内（允许一点容差）即视为已滚过去
          inViewport: rect.top < window.innerHeight && rect.bottom > 0,
          top: Math.round(rect.top),
          viewportHeight: window.innerHeight,
          scrollY: Math.round(window.scrollY),
        }
      })
      check('文章：点编辑后表单滚入视口', articleScroll.found && articleScroll.inViewport,
        JSON.stringify(articleScroll))
      await page.screenshot({ path: `${outDir}\\articles-edit-after.png` })
    }

    // ---------- 2) 侧边栏管理：左右留白
    await page.goto(`${base}/admin/sidebar`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2000)
    const sidebarLayout = await page.evaluate(() => {
      const root = document.querySelector('.admin-sidebar')
      if (!root) return { found: false }
      const style = getComputedStyle(root)
      const rect = root.getBoundingClientRect()
      return {
        found: true,
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        rootLeft: Math.round(rect.left),
        rootRight: Math.round(rect.right),
        viewportWidth: window.innerWidth,
      }
    })
    // 留白生效：容器左右都应离屏幕边缘有距离，且顶部有内边距
    check('侧边栏：内容有左右留白（不贴边）',
      sidebarLayout.found && sidebarLayout.rootLeft > 0 && sidebarLayout.rootRight < sidebarLayout.viewportWidth,
      JSON.stringify(sidebarLayout))
    check('侧边栏：有上下留白', sidebarLayout.paddingTop !== '0px', `padding-top=${sidebarLayout.paddingTop}`)

    // ---------- 3) 案例管理：无「受理法院」字段
    await page.goto(`${base}/admin/cases`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)
    const caseCreate = page.locator('button:has-text("新建案例"), button:has-text("新建")').first()
    if (await caseCreate.count() > 0) {
      await caseCreate.click()
      await page.waitForTimeout(2000)
    }
    const courtInfo = await page.evaluate(() => ({
      courtInput: Boolean(document.querySelector('#case-court')),
      courtLabel: [...document.querySelectorAll('label')].some((el) => el.textContent?.includes('受理法院')),
      hasBrandSelect: Boolean(document.querySelector('#case-brand')),
      hasCreateButton: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('新建')),
    }))
    check('案例：表单已无「受理法院」字段', !courtInfo.courtInput && !courtInfo.courtLabel, JSON.stringify(courtInfo))
    check('案例：品牌选择控件存在', courtInfo.hasBrandSelect)

    // ---------- 4) 品牌：搜不到可新建
    if (courtInfo.hasBrandSelect) {
      const brandName = `测试品牌${Date.now().toString().slice(-6)}`
      const searchInput = page.locator('#case-brand-keyword')
      await searchInput.fill(brandName)
      await page.locator('#case-brand-keyword').press('Enter')
      await page.waitForTimeout(2500)

      const createVisible = await page.locator(`button:has-text("${brandName}")`).count()
      check('品牌：搜不到时出现「用输入名称新建」按钮', createVisible > 0, `buttons=${createVisible}`)

      if (createVisible > 0) {
        await page.locator(`button:has-text("${brandName}")`).first().click()
        await page.waitForTimeout(3000)
        const afterCreate = await page.evaluate(() => {
          const select = document.querySelector('#case-brand')
          return {
            selectedValue: select ? select.value : null,
            noticeText: document.body.textContent?.includes('已新建品牌') ?? false,
          }
        })
        check('品牌：新建后自动关联（select 有值）',
          Boolean(afterCreate.selectedValue), JSON.stringify(afterCreate))
        await page.screenshot({ path: `${outDir}\\case-brand-created.png` })
      }
    }
    // ---------- 5) 侧边栏管理「编辑内容」→ 文章页应定位到该文章表单
    await page.goto(`${base}/admin/sidebar`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2000)
    // 先确保侧边栏至少有一篇文章，否则没有「编辑内容」可点
    const sidebarProbe = await page.evaluate(async () => {
      const response = await fetch('/api/admin/articles?sidebar=1&pageSize=1')
      const payload = await response.json()
      return payload?.data?.[0]?.id ?? null
    })
    if (sidebarProbe === null) {
      // 后台没有侧边栏文章时，直接构造深链验证同样的滚动路径
      const listResponse = await fetch(`${base}/api/admin/articles?pageSize=1`, {
        headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
        signal: AbortSignal.timeout(30000),
      })
      const listPayload = await listResponse.json()
      const fallbackId = listPayload?.data?.[0]?.id
      check('侧边栏：可取得文章 id 用于深链验证', Boolean(fallbackId), `id=${fallbackId}`)
      if (fallbackId) {
        await page.goto(`${base}/admin/articles?id=${fallbackId}`, { waitUntil: 'networkidle', timeout: 120000 })
        await page.waitForTimeout(3000)
        const deepLink = await page.evaluate(() => {
          const editor = document.querySelector('.admin-articles__editor')
          if (!editor) return { found: false }
          const rect = editor.getBoundingClientRect()
          return {
            found: true,
            inViewport: rect.top < window.innerHeight && rect.bottom > 0,
            top: Math.round(rect.top),
            scrollY: Math.round(window.scrollY),
          }
        })
        check('文章：深链 ?id= 进入后表单滚入视口', deepLink.found && deepLink.inViewport, JSON.stringify(deepLink))
      }
    }

    // ---------- 6) 律所管理：新建/编辑后表单滚入视口
    await page.goto(`${base}/admin/law-firms`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)
    const firmCreate = page.locator('button:has-text("新建")').first()
    if (await firmCreate.count() === 0) {
      check('律所页存在新建按钮', false)
    } else {
      await firmCreate.click()
      await page.waitForTimeout(2500)
      const firmScroll = await page.evaluate(() => {
        const editor = document.querySelector('.admin-entity__editor')
        if (!editor) return { found: false }
        const rect = editor.getBoundingClientRect()
        return {
          found: true,
          inViewport: rect.top < window.innerHeight && rect.bottom > 0,
          top: Math.round(rect.top),
          scrollY: Math.round(window.scrollY),
        }
      })
      check('律所：点新建后表单滚入视口', firmScroll.found && firmScroll.inViewport, JSON.stringify(firmScroll))
      await page.screenshot({ path: `${outDir}\\law-firm-create-after.png` })
    }

    // ---------- 6b) 代理律所字段：与涉案品牌同一套「可搜索 + 搜不到直接新建」
    //      （这两个控件都在案例页的编辑表单里，不在律所管理页）
    await page.goto(`${base}/admin/cases`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)
    const caseCreate2 = page.locator('button:has-text("新建案例"), button:has-text("新建")').first()
    if (await caseCreate2.count() > 0) {
      await caseCreate2.click()
      await page.waitForTimeout(2000)
    }
    const firmSearch = page.locator('#case-law-firm-keyword')
    if (await firmSearch.count() === 0) {
      check('案例页存在代理律所搜索框', false)
    } else {
      check('案例页存在代理律所搜索框', true)
      const firmName = `测试律所${Date.now().toString().slice(-6)}`
      await firmSearch.fill(firmName)
      await firmSearch.press('Enter')
      await page.waitForTimeout(2500)

      const firmCreateButton = await page.locator(`button:has-text("${firmName}")`).count()
      check('律所：搜不到时出现新建按钮', firmCreateButton > 0, `buttons=${firmCreateButton}`)

      if (firmCreateButton > 0) {
        await page.locator(`button:has-text("${firmName}")`).first().click()
        await page.waitForTimeout(3000)
        const firmAfter = await page.evaluate(() => {
          const select = document.querySelector('#case-law-firm')
          return {
            selectedValue: select ? select.value : null,
            noticeText: document.body.textContent?.includes('已新建律所') ?? false,
          }
        })
        check('律所：新建后自动关联', Boolean(firmAfter.selectedValue), JSON.stringify(firmAfter))
        await page.screenshot({ path: `${outDir}\\case-law-firm-created.png` })
      }
    }

    // ---------- 7) 分页默认每页 10 条（下拉档位含 10，且当前选中 10）
    await page.goto(`${base}/admin/articles`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.waitForTimeout(2500)
    const pagerInfo = await page.evaluate(() => {
      const pager = document.querySelector('.admin-pager')
      const selects = [...document.querySelectorAll('.admin-pager select, select')]
      const pageSizeSelect = selects.find((el) => [...el.options].some((o) => /条/.test(o.textContent || '')))
      return {
        pagerExists: Boolean(pager),
        pageSizeValue: pageSizeSelect ? pageSizeSelect.value : null,
        options: pageSizeSelect ? [...pageSizeSelect.options].map((o) => o.value) : [],
      }
    })
    check('分页存在每页条数下拉', pagerInfo.pagerExists && pagerInfo.options.length > 0, JSON.stringify(pagerInfo))
    check('分页默认选中 10 条', pagerInfo.pageSizeValue === '10', `value=${pagerInfo.pageSizeValue}`)
    check('分页档位包含 10 条', pagerInfo.options.includes('10'), `options=${pagerInfo.options.join(',')}`)
  } finally {
    await browser.close()
  }

  const passed = results.filter(Boolean).length
  console.log(`\n合计 ${results.length} 项，通过 ${passed}，失败 ${results.length - passed}`)
  process.exitCode = passed === results.length ? 0 : 1
}
