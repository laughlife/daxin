/**
 * 浏览器验收（Playwright）。
 *
 * 需要可用的 Playwright：PLAYWRIGHT_MODULE 可指向 bundled module 的 file:// URL，
 * BROWSER_EXECUTABLE 可指定浏览器可执行文件。
 *
 * 说明：本脚本已按「页面改由数据库 API 驱动」后的实现重写。
 * 原先把索引的本地 Mock 案件（如 legacy-351、25-cv-9001）与固定条数写死在断言里，
 * 数据换成真实库后这些断言必然失败，因此改为：
 *   - 断言内容取自真实数据的可验证特征（真实案件号前缀、真实品牌 slug）；
 *   - 分页与条数用页面实际渲染的文案解析，而不写死页数；
 *   - 不再引用已删除的 mock 数据与已移除的首页区块。
 */
import assert from 'node:assert/strict'
import { shanghaiDate } from '../app/utils/content.ts'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.SMOKE_BASE_URL || 'http://[::1]:3002'
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
let count = 0
function check(name, condition) { assert.ok(condition, name); console.log(`PASS ${++count}: ${name}`) }
async function visit(path) { await page.goto(`${base}${path}`, { waitUntil: 'networkidle' }) }

/** 从分页文案「总计 N 条案件，第 X / Y 页」解析出页码，避免写死页数。 */
async function readPagerSummary(selector) {
  const text = await page.locator(selector).innerText()
  const match = /第\s*(\d+)\s*\/\s*(\d+)\s*页/.exec(text.replace(/\s+/g, ' '))
  return {
    text,
    page: match ? Number(match[1]) : 0,
    totalPages: match ? Number(match[2]) : 0,
  }
}

try {
  // ---------- 首页 ----------
  await visit('/')
  // 需求（2026-10-10 修订）：首页顶部保留「联系我们可领取 TRO 侵权大礼包」公告与微信号复制入口。
  const announcementText = await page.locator('.site-announcement').innerText()
  check('首页显示 TRO 侵权大礼包公告', announcementText.includes('TRO 侵权大礼包'))
  check('公告栏保留微信号复制入口', announcementText.includes('kjzx88'))
  check('首页背景具有动态光效', await page.locator('.home-hero').evaluate(el => getComputedStyle(el, '::before').animationName.includes('hero-atmosphere')))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  check('减少动态偏好关闭背景动画', await page.locator('.home-hero').evaluate(el => getComputedStyle(el, '::before').animationName === 'none'))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '复制 TRO 咨询号 kjzx88', exact: true }).click()
  check('公告一键复制精确微信号', await page.evaluate(() => navigator.clipboard.readText()) === 'kjzx88')

  // 首页核心业务（需求 2026-10-10 修订）：
  //   - 四块样式一致，「TRO全流程处理」不再单独红色强调；
  //   - 不再有「了解详情」入口；
  //   - 成绩文案整体可点击跳转 TRO 成功案例，其中「0赔偿撤诉」加粗放大。
  // 说明：首页业务卡片目前仍来自前端 config（web/app/config/businessContent.ts），
  // 数据库中的 service_sections 是后台配置项的预备数据，尚未驱动首页渲染。
  const businessSection = page.locator('.business-section')
  check('首页核心业务区块存在', await businessSection.count() === 1)
  check('核心业务四块卡片齐全', await businessSection.locator('.business-card').count() === 4)
  check('核心业务不再有红色强调卡片', await businessSection.locator('.business-card--accent').count() === 0)
  check('核心业务不再显示了解详情', await businessSection.locator('.business-card__detail').count() === 0)
  check('成绩文案可点击跳转成功案例', await businessSection.locator('a.business-card__achievement[href="/tro/success-cases"]').count() === 1)
  check('成绩关键短语加粗显示', (await businessSection.locator('.business-card__achievement-key').innerText()).trim() === '0赔偿撤诉')

  // 「精选历史 TRO 案件」区块按需求（2026-10-10）移除
  check('首页已移除精选历史 TRO 案件区块', await page.locator('.case-preview-section').count() === 0)

  // 需求（2026-10-10）：案例模块分四类、每类只展示近三篇；
  // 四个栏目上下排列（不再左右两列）；每篇最左侧配一张图。
  // 注意：这几项必须在「还在首页」时校验，不能放到后面访问过详情页之后再查。
  check('首页案例分区为四类', await page.locator('.article-preview-section__column').count() === 4)
  check('首页案例分区标题齐全', await page.locator('.article-preview-section__column-title').evaluateAll(
    items => ['TRO 案件预警', 'TRO 成功案例', '劳动法案例', '货代案例'].every(title => items.some(el => el.textContent.trim() === title))
  ))
  const perColumnCounts = await page.locator('.article-preview-section__column').evaluateAll(
    columns => columns.map(column => column.querySelectorAll('.article-preview-card').length)
  )
  check('每类案例不超过三篇', perColumnCounts.every(count => count <= 3))
  check('有内容的两类各三篇', perColumnCounts.filter(count => count === 3).length === 2)
  check('首页展示推荐阅读', await page.locator('.article-preview-card').count() > 0)

  // 四个栏目上下排列：容器的计算列数应为 1
  const columnTrackCount = await page.locator('.article-preview-section__columns').evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length
  )
  check('案例四栏为上下单列排列', columnTrackCount === 1)

  // 每篇最左侧配图：有文章的两类共 6 篇，应各有 1 张图
  const thumbCount = await page.locator('.article-preview-card__thumb img').count()
  const articleCount = await page.locator('.article-preview-card').count()
  check('有文章的案例均带左侧配图', thumbCount === articleCount && thumbCount > 0)

  await page.getByRole('button', { name: '联系我们免费评估案件', exact: true }).click()
  check('免费评估仅显示 TRO 咨询二维码', await page.getByRole('dialog').locator('[data-qr-id]').evaluateAll(items => items.length === 1 && items[0].dataset.qrId === 'tro-consult'))
  check('咨询弹窗不显示微信号与复制按钮', !(await page.getByRole('dialog').innerText()).match(/kjzx88|chen_6506|复制/))
  await page.keyboard.press('Escape')

  // ---------- 内容栏目：侧栏二维码与文章阅读 ----------
  for (const [path, expected] of [
    ['/tro/alerts', ['tro-public', 'tro-consult']],
    ['/domestic/labor-disputes', ['labor-public', 'labor-consult']],
    ['/faq/labor', ['labor-public', 'labor-consult']],
    ['/faq/cross-border', ['tro-public', 'tro-consult', 'labor-public', 'labor-consult']],
  ]) {
    await visit(path)
    const ids = await page.locator('.content-sidebar [data-qr-id]').evaluateAll(elements => elements.map(el => el.dataset.qrId))
    check(`${path} 精确使用对应业务二维码`, JSON.stringify(ids) === JSON.stringify(expected))
  }

  // /tro/alerts 有 251 篇真实文章：验证检索与阅读
  await visit('/tro/alerts')
  check('栏目列表渲染真实文章', await page.locator('.article-list__card').count() > 0)
  await page.locator('.listing-search input[type=search]').fill('Keith')
  await page.locator('.article-list__card').first().waitFor()
  check('栏目关键词检索返回结果', await page.locator('.article-list__card').count() > 0)
  await page.locator('.listing-search input[type=search]').fill('不存在的关键词zzz')
  await page.waitForFunction(() => document.querySelectorAll('.article-list__card').length === 0)
  check('无结果时列表为空而非报错', await page.locator('.article-list__card').count() === 0)

  await visit('/tro/alerts?page=1')
  await page.locator('.article-list h2 a').first().click()
  await page.locator('.article-detail__body').waitFor()
  check('文章详情渲染正文', await page.locator('.article-detail__body').count() === 1 && await page.locator('.rich-article-body').count() === 1)

  // 空分类栏目应显示空状态，且不应退化成「列出全部文章」
  await visit('/domestic/labor-disputes')
  check('空分类显示空状态', await page.locator('.article-list__card').count() === 0)

  // ---------- 案件查询 ----------
  await visit('/tro/cases')
  const firstPager = await readPagerSummary('.case-pagination__summary')
  check('案件分页显示真实总数', firstPager.text.includes('条案件') && firstPager.totalPages > 1)
  check('案件表格有数据行', await page.locator('tbody tr').count() > 0)

  await visit('/tro/cases?page=999')
  const clamped = await readPagerSummary('.case-pagination__summary')
  check('越界页码钳制为最后一页', clamped.page === clamped.totalPages && !clamped.text.includes('999'))
  check('越界页码仍有数据', await page.locator('tbody tr').count() > 0)

  await visit('/tro/cases')
  await page.locator('#case-search-keyword').fill('Keith')
  await page.waitForURL('**q=Keith*')
  check('关键词筛选同步到 URL', await page.locator('tbody tr').count() > 0)

  // 需求（2026-10-10）：起诉时间只保留一个选择框，不再是从 / 至两个框
  await visit('/tro/cases')
  check('起诉时间只有一个日期框', await page.locator('.case-search-panel input[type=date]').count() === 1)
  check('存在起诉时间单选字段', await page.locator('#case-search-date').count() === 1)
  await page.locator('#case-search-date').fill('2025-01-01')
  await page.waitForURL('**from=2025-01-01*')
  check('起诉时间筛选同步到 URL', await page.locator('tbody tr').count() > 0)

  // ---------- 品牌库与律所 ----------
  await visit('/brands')
  check('品牌库渲染真实品牌档案', await page.locator('.directory__card').count() > 0)
  const brandDetailHref = await page.locator('.directory__card a[href^="/brands/"]').first().getAttribute('href')
  check('品牌档案有详情链接', Boolean(brandDetailHref))
  await visit(brandDetailHref)
  await page.locator('.entity-detail__header').waitFor()
  check('品牌详情显示关联案件', await page.locator('.entity-detail__cases article').count() > 0)

  await visit('/law-firms/law-firm-keith')
  await page.locator('.entity-detail__header').waitFor()
  check('律所详情显示关联案件', await page.locator('.entity-detail__cases article').count() > 0)

  // ---------- 关于我们 ----------
  await visit('/about')
  // 对齐旧站结构：首屏公司介绍 + 核心业务 + 成功案例 + 企业宣讲 + 我们的小伙伴。
  // 注意：断言范围限定在 .about-page 内，因为页脚也有 aria-label="公司介绍"，
  // 不限定范围会把页脚的区块也算进来。
  const aboutPage = page.locator('.about-page')
  check('关于我们包含成功案例区块', await aboutPage.locator('[aria-label="成功案例"]').count() === 1)
  check('关于我们包含公司介绍区块', await aboutPage.locator('[aria-label="公司介绍"]').count() === 1)
  check('关于我们包含核心业务区块', await aboutPage.locator('[aria-label="核心业务"]').count() === 1)
  check('关于我们包含企业宣讲区块', await aboutPage.locator('[aria-label="企业宣讲"]').count() === 1)
  check('关于我们包含我们的小伙伴区块', await aboutPage.locator('[aria-label="我们的小伙伴"]').count() === 1)
  // 旧站该页顶部有扫码大礼包区，按需求不保留
  check('关于我们不含扫码大礼包区域', !(await page.locator('body').innerText()).includes('扫码领取'))
  // 旧站的英文副标题
  check('关于我们保留英文副标题', await aboutPage.locator('.section-heading__eyebrow').evaluateAll(
    items => ['TRO SUCCESS STORIES', 'COMPANY PRESENTATION', 'OUR FRIENDS'].every(text => items.some(el => el.textContent.trim() === text))
  ))
  // 核心业务与成功案例用旧站图片，不再复用首页卡片与文章列表
  check('关于我们核心业务用旧站图片', await aboutPage.locator('.about-page__business-gallery img').count() === 2)
  check('关于我们成功案例用旧站图片', await aboutPage.locator('.about-page__success-gallery img').count() === 4)
  check('关于我们不再复用首页业务卡片', await aboutPage.locator('.business-card').count() === 0)
  check('关于我们不再用文章列表做成功案例', await aboutPage.locator('.article-list__card').count() === 0)

  // ---------- 页脚：业务项可点击 ----------
  await visit('/')
  const footerLinks = page.locator('.site-footer__service-link')
  check('页脚业务项为可点击链接', await footerLinks.count() > 0)
  const footerHref = await footerLinks.first().getAttribute('href')
  check('页脚业务项有有效 href', Boolean(footerHref) && footerHref.startsWith('/'))

  // 需求（2026-10-10）：页脚三列竖排——①公司介绍 + logo + 两个公众号二维码 ②业务范围 ③联系我们；
  // 页脚用新 logo（不再有文字占位）；二维码下方只保留名称，不显示「扫码关注 · 获取资讯」；
  // 页头已放 logo，不再并列显示站名与副标题。
  const footer = page.locator('.site-footer')
  check('页脚为三列竖排布局', await footer.locator('.site-footer__column').count() === 3)
  check('页脚首列为公司介绍', await footer.locator('.site-footer__column--brand').count() === 1)
  check('页脚首列含两个公众号二维码', await footer.locator('.site-footer__channels figure').count() === 2)
  check('页脚二维码只需要名称', await footer.locator('.contact-qr-grid__note').count() === 0)
  check('页脚不再有相关链接栏', !(await footer.innerText()).includes('相关链接'))
  check('页脚使用 logo 图片', await footer.locator('.site-footer__logo-img').count() === 1)
  check('页脚不再有文字方块占位', await footer.locator('.site-footer__logo').count() === 0)
  check('页头使用 logo 图片', await page.locator('.site-header__logo-img').count() === 1)
  check('页头不再并列显示站名文字', await page.locator('.site-header__logo-text').count() === 0)
  check('页头不出现站名副标题文本', !(await page.locator('.site-header__inner').innerText()).includes('跨境电商与国际物流法律服务'))

  // ---------- 移动端 ----------
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/tro/cases', '/brands', '/about', '/tro/alerts']) {
    await visit(path)
    check(`${path} 手机无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }

  await visit('/')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), `菜单第 ${i + 1} 次 Tab 焦点应留在抽屉内`)
  }
  check('手机菜单 Tab 焦点循环', true)
  await page.keyboard.press('Escape')
  check('关闭菜单焦点回到触发按钮', await page.getByRole('button', { name: '打开菜单', exact: true }).evaluate(el => el === document.activeElement))
  check('浏览器无脚本错误', errors.length === 0)
  console.log(`浏览器验收完成：${count} 项通过`)
} finally {
  await browser.close()
}
