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
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002'
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
  check('首页已移除旧主视觉区块', await page.locator('.home-hero').count() === 0)
  check('团队介绍成为首页首屏', await page.locator('.home-team-intro').count() === 1)
  check('团队介绍使用配置标题', (await page.locator('.home-team-intro__title').innerText()).trim().length > 0)
  check('首页保留案件查询与免费评估按钮',
    await page.getByRole('link', { name: '查询 TRO 案件', exact: true }).count() === 1
    && await page.getByRole('button', { name: '联系我们免费评估案件', exact: true }).count() === 1)
  check('顶部按钮、对号圆底和免费评估按钮统一为指定金色', await page.evaluate(() => {
    const header = document.querySelector('.site-header__cta')
    const checkmark = document.querySelector('.home-team-intro__features li')
    const contact = document.querySelector('.home-team-intro__button--secondary')
    if (!header || !checkmark || !contact) return false
    return getComputedStyle(header).backgroundColor === 'rgb(238, 175, 78)'
      && getComputedStyle(checkmark, '::before').backgroundColor === 'rgb(238, 175, 78)'
      && getComputedStyle(contact).backgroundColor === 'rgb(238, 175, 78)'
      && getComputedStyle(checkmark, '::before').maskImage.includes('data:image/svg+xml')
  }))
  check('首页移除了解更多链接', await page.getByRole('link', { name: '了解更多', exact: true }).count() === 0)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '复制 TRO 咨询号 kjzx88', exact: true }).click()
  check('公告一键复制精确微信号', await page.evaluate(() => navigator.clipboard.readText()) === 'kjzx88')

  // 首页顺序为团队介绍、数据指标、核心业务；业务面板保持五步 01-05 展开流程。
  const coreBusiness = page.locator('.core-business')
  check('首页核心业务区块存在', await coreBusiness.count() === 1)
  check('核心业务五个面板齐全', await coreBusiness.locator('.core-business__panel').count() === 5)
  check('核心业务顺序为 01-05',
    JSON.stringify(await coreBusiness.locator('.core-business__number').allInnerTexts()) === JSON.stringify(['01', '02', '03', '04', '05']))
  check('核心业务不再显示右侧加号', await coreBusiness.locator('.core-business__marker').count() === 0)
  check('核心业务每个面板都有书剑图标',
    await coreBusiness.locator('.core-business__panel').count() === 5
    && await coreBusiness.locator('.core-business__icon img[src="/favicon.png"]').count() === 5)
  check('首页区块顺序为团队介绍、指标、核心业务', await page.evaluate(() => {
    const intro = document.querySelector('.home-team-intro')
    const stats = document.querySelector('.home-about')
    const core = document.querySelector('.core-business')
    return Boolean(intro && stats && core
      && (intro.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (stats.compareDocumentPosition(core) & Node.DOCUMENT_POSITION_FOLLOWING))
  }))
  check('核心业务面板预留主题色图片展示位', await coreBusiness.locator('.core-business__image').count() === 5)
  check('展开面板使用书剑 Logo 作为背景水印', await coreBusiness.locator('.core-business__panel--active').evaluate(el =>
    getComputedStyle(el, '::before').backgroundImage.includes('/favicon.png')
    && getComputedStyle(el, '::before').backgroundPosition === '50% 50%'))
  check('核心业务默认展开最后一个面板',
    await coreBusiness.locator('.core-business__panel').last().locator('.core-business__toggle').getAttribute('aria-expanded') === 'true')
  check('竖排标题里的 TRO 连续显示为一组',
    await coreBusiness.locator('.core-business__title-latin').first().innerText() === 'TRO'
    && await coreBusiness.locator('.core-business__title-latin').first().evaluate(el => getComputedStyle(el).textCombineUpright) === 'all')
  await coreBusiness.locator('.core-business__toggle').first().click()
  await page.waitForFunction(() => {
    const body = document.querySelector('.core-business__panel .core-business__body')
    return body !== null && getComputedStyle(body).opacity === '1'
  })
  check('点击业务面板后展开文案与图片位',
    await coreBusiness.locator('.core-business__toggle').first().getAttribute('aria-expanded') === 'true'
    && await coreBusiness.locator('.core-business__panel').first().locator('.core-business__body').evaluate(el => getComputedStyle(el).opacity) === '1')

  // 团队介绍文案保持不变，背景图提亮并保持原色，不添加主题色滤镜。
  check('团队介绍不再包含四个业务卡片', await page.locator('.home-team-services__card').count() === 0)
  check('团队介绍背景图覆盖整个区块且仅提亮', await page.locator('.home-team-intro__background').evaluate(el => {
    const style = getComputedStyle(el)
    return style.backgroundImage !== 'none'
      && style.backgroundSize === 'cover'
      && style.backgroundRepeat === 'no-repeat'
      && style.filter === 'brightness(1.18)'
  }))
  check('团队介绍文案叠加在背景图上且已移除 ABOUT US', await page.evaluate(() => {
    const el = document.querySelector('.home-team-intro')
    const content = el?.querySelector('.home-team-intro__content')
    if (!el || !content || el.querySelector('.home-team-intro__eyebrow')) return false
    return !el.querySelector('.home-team-intro__visual')
      && content.closest('.home-team-intro') === el
      && el.querySelector('.home-team-intro__background') !== null
  }))

  // 「精选历史 TRO 案件」区块按需求（2026-10-10）移除
  check('首页已移除精选历史 TRO 案件区块', await page.locator('.case-preview-section').count() === 0)

  // 需求（2026-10-10）：案例模块分四类、每类只展示近三篇；
  // 四个栏目上下排列（不再左右两列）；每篇最左侧配一张图。
  // 注意：这几项必须在「还在首页」时校验，不能放到后面访问过详情页之后再查。
  check('首页案例分区为四类', await page.locator('.article-preview-section__column').count() === 4)
  // 标题以数据库 article_categories.name 为准（后台可改分类名，断言不能写死旧叫法）
  check('首页案例分区标题齐全', await page.locator('.article-preview-section__column-title').evaluateAll(
    items => ['TRO 侵权预警', 'TRO 成功案例', '劳动纠纷', '货代案例'].every(title => items.some(el => el.textContent.trim() === title))
  ))
  const perColumnCounts = await page.locator('.article-preview-section__column').evaluateAll(
    columns => columns.map(column => column.querySelectorAll('.article-preview-card').length)
  )
  check('每类案例不超过三篇', perColumnCounts.every(count => count <= 3))
  // 分类内容量取决于实际文章数，不写死「两类各三篇」；
  // 当前 TRO侵权预警 分类下暂无文章，因此只要求有内容的栏目都满 3 篇。
  check('有内容的案例栏目各三篇', perColumnCounts.filter(count => count === 3).length >= 3)
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
  // 侧栏按栏目所属业务只展示对应的一组（公共号 + 咨询号），
  // 不是把四个渠道全列出来 —— /faq/cross-border 属 TRO 业务，故只应出现 tro 组。
  for (const [path, expected] of [
    ['/tro/alerts', ['tro-public', 'tro-consult']],
    ['/domestic/labor-disputes', ['labor-public', 'labor-consult']],
    ['/faq/labor', ['labor-public', 'labor-consult']],
    ['/faq/cross-border', ['tro-public', 'tro-consult']],
  ]) {
    await visit(path)
    const ids = await page.locator('.content-sidebar [data-qr-id]').evaluateAll(elements => elements.map(el => el.dataset.qrId))
    check(`${path} 精确使用对应业务二维码`, JSON.stringify(ids) === JSON.stringify(expected))
  }

  // 用有真实数据的分类验证检索与阅读。
  // 说明：原脚本用的是 /tro/alerts（TRO侵权预警），但该分类当前 0 篇文章
  // （公众号采集落到了 tro-success / knowledge / labor-case / freight-case），
  // 空分类无法验证「渲染真实文章 / 关键词检索」，故改用 /tro/success-cases。
  await visit('/tro/success-cases')
  check('栏目列表渲染真实文章', await page.locator('.article-list__card').count() > 0)
  await page.locator('.listing-search input[type=search]').fill('Keith')
  await page.locator('.article-list__card').first().waitFor()
  check('栏目关键词检索返回结果', await page.locator('.article-list__card').count() > 0)
  await page.locator('.listing-search input[type=search]').fill('不存在的关键词zzz')
  await page.waitForFunction(() => document.querySelectorAll('.article-list__card').length === 0)
  check('无结果时列表为空而非报错', await page.locator('.article-list__card').count() === 0)

  // 说明：站内文章目前全部来自公众号采集，只存列表元数据与封面、不存正文，
  // 因此列表里的文章链接直接指向公众号原文（详情接口也会 302 跳转）。
  // 这里按真实行为断言，不再期待站内渲染正文。
  await visit('/tro/success-cases?page=1')
  const firstArticleHref = await page.locator('.article-list h2 a').first().getAttribute('href')
  check('导入文章的链接直达公众号原文',
    (firstArticleHref ?? '').includes('mp.weixin.qq.com'),
    (firstArticleHref ?? '').slice(0, 56))

  // 空分类栏目应显示空状态，且不应退化成「列出全部文章」
  // 改用仍为 0 篇的「热点资讯」：TRO侵权预警 已在 029 迁移后填充了 345 篇
  await visit('/news')
  check('空分类显示空状态', await page.locator('.article-list__card').count() === 0)

  // ---------- 案件查询 ----------
  // 注意：cases 表当前 2000 条是 draft、仅 3 条 published，
  // 公开接口只返回已发布的，因此只有 1 页、不产生分页条。
  // 断言按「有无多页」分支，避免被数据状态绑死（数据补齐后自动校验分页）。
  await visit('/tro/cases')
  const caseInfo = await page.evaluate(() => {
    const summary = document.querySelector('.case-pagination__summary')?.textContent?.trim() ?? ''
    const bodyText = document.body.innerText
    return {
      summary,
      totalPages: Number(summary.match(/\/\s*(\d+)\s*页/)?.[1] ?? 1),
      showsCount: /共找到\s*\d+/.test(bodyText) || /总计\s*\d+/.test(bodyText),
      rows: document.querySelectorAll('tbody tr').length,
    }
  })
  check('案件列表显示结果总数', caseInfo.showsCount === true)
  check('案件表格有数据行', caseInfo.rows > 0, `${caseInfo.rows} 行`)
  check('多页时显示分页摘要',
    caseInfo.totalPages <= 1 || caseInfo.summary.includes('条案件'),
    `totalPages=${caseInfo.totalPages} summary="${caseInfo.summary.slice(0, 40)}"`)

  await visit('/tro/cases?page=999')
  const clampedRows = await page.locator('tbody tr').count()
  check('越界页码不报错且仍返回数据', clampedRows > 0, `${clampedRows} 行`)

  await visit('/tro/cases')
  // 需求 2026-10-20：关键词框改为公共 SearchPill 组件，旧 id #case-search-keyword 已不存在，
  // 这里改用结构选择器，避免以后组件再换 id 时又断一次。
  await page.locator('.case-search-panel .search-pill__input').fill('Keith')
  await page.waitForURL('**q=Keith*')
  // 这条断言的是「筛选条件同步到 URL」，不是命中数量：
  // 目前仅 3 条案件为 published，搜索词未必命中，用行数判定会被数据状态左右。
  check('关键词筛选同步到 URL', page.url().includes('q=Keith'))

  // 需求（2026-10-10）：起诉时间只保留一个选择框，不再是从 / 至两个框
  await visit('/tro/cases')
  check('起诉时间只有一个日期框', await page.locator('.case-search-panel input[type=date]').count() === 1)
  check('存在起诉时间单选字段', await page.locator('#case-search-date').count() === 1)
  await page.locator('#case-search-date').fill('2025-01-01')
  await page.waitForURL('**from=2025-01-01*')
  check('起诉时间筛选同步到 URL', page.url().includes('from=2025-01-01'))

  // ---------- 品牌库与律所 ----------
  await visit('/brands')
  check('品牌库渲染真实品牌档案', await page.locator('.brand-card').count() > 0)
  check('品牌库提供全部、商标、专利、版权分类', await page.locator('.brand-directory__tabs button').evaluateAll(
    elements => ['全部', '商标', '专利', '版权'].every(label => elements.some(el => el.querySelector('span')?.textContent.trim() === label))
  ))
  await page.getByRole('button', { name: /专利/ }).click()
  await page.waitForURL('**type=patent*')
  check('点击专利分类后筛选状态同步到 URL', await page.getByRole('button', { name: /专利/ }).getAttribute('aria-pressed') === 'true')
  await page.getByRole('button', { name: /^全部/ }).click()
  // 按「真实存在的品牌名」检索，而不是写死某个案件号：
  // cases 表目前仅 3 条 published，案件号与品牌的关联大量为空，写死会误报。
  // 卡片标题形如「acdanc 商标」，末尾是类型标签，检索时只取品牌名本身
  const sampleBrand = (await page.locator('.brand-card h3').first().innerText()).trim().split(/\s+/)[0]
  await page.getByRole('searchbox', { name: '关键词' }).fill(sampleBrand)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.waitForURL(`**q=${encodeURIComponent(sampleBrand)}*`)
  // 检索后列表会先进入 loading 再换数据，等结果稳定（卡片或空状态）再计数
  await page.waitForFunction(
    () => document.querySelectorAll('.brand-card').length > 0
      || document.querySelector('.brand-directory__empty') !== null,
    null,
    { timeout: 15000 },
  ).catch(() => {})
  const filteredCount = await page.locator('.brand-card').count()
  const emptyShown = await page.locator('.brand-directory__empty').count() > 0
  check('品牌库支持关键词检索', filteredCount > 0 && !emptyShown,
    `「${sampleBrand}」命中 ${filteredCount} 个`)
  await visit('/brands')
  const brandDetailHref = await page.locator('.brand-card[href^="/brands/"]').first().getAttribute('href')
  check('品牌档案有详情链接', Boolean(brandDetailHref))
  await visit(brandDetailHref)
  await page.locator('.entity-detail__header').waitFor()
  check('品牌详情显示关联案件', await page.locator('.entity-detail__cases article').count() > 0)

  // 律所 slug 会随数据导入变化（worldtro 导入后是 worldtro-law-firm-*），
  // 不再写死某一个 slug，改为取列表里第一条真实详情链接
  await visit('/law-firms')
  const lawFirmHref = await page.locator('a[href^="/law-firms/"]').first().getAttribute('href')
  check('律所库有详情链接', Boolean(lawFirmHref), lawFirmHref ?? '')
  await visit(lawFirmHref)
  await page.locator('.entity-detail__header').waitFor()
  check('律所详情页可打开', await page.locator('.entity-detail__header').count() === 1)

  // ---------- 关于我们 ----------
  await visit('/about')
  // 注意：断言范围限定在 .about-page 内，因为页脚也有 aria-label="公司介绍"，
  // 不限定范围会把页脚的区块也算进来。
  const aboutPage = page.locator('.about-page')
  check('关于我们包含成功案例区块', await aboutPage.locator('[aria-label="成功案例"]').count() === 1)
  check('关于我们包含公司介绍区块', await aboutPage.locator('[aria-label="公司介绍"]').count() === 1)
  check('关于我们包含企业宣讲区块', await aboutPage.locator('[aria-label="企业宣讲"]').count() === 1)
  check('关于我们包含我们的小伙伴区块', await aboutPage.locator('[aria-label="我们的小伙伴"]').count() === 1)
  // 说明：关于我们的「核心业务」区块在 8d48b13（重构首页与关于我们内容结构）中已删除，
  // 因此不再断言它存在，改为锁定当前结构，防止被无意加回。
  check('关于我们不含已删除的核心业务区块', await aboutPage.locator('[aria-label="核心业务"]').count() === 0)
  // 旧站该页顶部有扫码大礼包区，按需求不保留
  check('关于我们不含扫码大礼包区域', !(await page.locator('body').innerText()).includes('扫码领取'))
  // 需求 2026-10-20：企业宣讲改为 4 列 × 2 行共 8 个展示位 + 轮播
  check('企业宣讲为 4×2 轮播',
    await aboutPage.locator('.presentation-carousel__grid li').count() === 8
    && await aboutPage.locator('.presentation-carousel__controls').count() === 1)
  // 合作伙伴：有 ≥2 个单独 logo 时走跑马灯，否则暂用静态图兜底
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
