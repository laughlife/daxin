// Task 6 验收测试：文章公开接口的纯逻辑（不连接数据库）。
//
// 覆盖：分页夹取、文章筛选参数解析、LIKE 通配符转义、配图选择规则、
// 服务端 HTML 清洗。分页函数直接复用 web/server/utils/public/query.ts，不重复实现。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizePage, normalizePageSize, resolvePageWindow } from '../server/utils/public/query.ts'
import {
  articleHref,
  escapeLikePattern,
  parseArticleFilters,
  pickArticleImageSrc,
  toArticleSourceUrl,
  toWechatArticleUrl,
  toArticleSummary,
  toPublicImageUrl,
} from '../server/utils/public/article-query.ts'
import { sanitizeHtml } from '../server/utils/public/sanitize.ts'
import { findContentSection } from '../app/config/contentSections.ts'

test('分页参数夹取：page 最小 1，pageSize 默认 12、上限 48', () => {
  for (const [input, expected] of [[undefined, 1], ['abc', 1], [0, 1], [-3, 1], [2.9, 2], ['5', 5], [1, 1]]) {
    assert.equal(normalizePage(input), expected, `page=${input}`)
  }
  for (const [input, expected] of [[undefined, 12], ['', 12], ['abc', 12], [999, 48], [48, 48], [0, 1], [-1, 1], [12, 12]]) {
    assert.equal(normalizePageSize(input), expected, `pageSize=${input}`)
  }
})

test('页码越界返回空窗口并把 page 夹到最后一页；total=0 也有稳定的第 1 页', () => {
  const first = resolvePageWindow(273, 1, 12)
  assert.equal(first.page, 1)
  assert.equal(first.pageSize, 12)
  assert.equal(first.total, 273)
  assert.equal(first.totalPages, 23)
  assert.equal(first.offset, 0)
  assert.equal(first.beyondLastPage, false)

  const last = resolvePageWindow(273, 23, 12)
  assert.equal(last.page, 23)
  assert.equal(last.offset, 264)
  assert.equal(last.beyondLastPage, false)

  const over = resolvePageWindow(273, 999, 12)
  assert.equal(over.page, 23)
  assert.equal(over.totalPages, 23)
  assert.equal(over.beyondLastPage, true)
  assert.equal(over.total, 273)

  const empty = resolvePageWindow(0, 4, 12)
  assert.equal(empty.total, 0)
  assert.equal(empty.totalPages, 1)
  assert.equal(empty.page, 1)
  assert.equal(empty.offset, 0)
  assert.equal(empty.beyondLastPage, false)

  // 任何输入都不会出现 page > totalPages（total > 0 时必然成立）
  for (const [requested, size] of [[1, 1], [7, 3], [999, 48], [50, 7], [4, 3]]) {
    const window = resolvePageWindow(273, requested, size)
    assert.ok(window.page >= 1 && window.page <= window.totalPages, `${requested}/${size} => ${window.page}/${window.totalPages}`)
    assert.equal(window.offset, (window.page - 1) * window.pageSize)
  }
})

test('文章筛选参数：分类白名单、关键词归一化与截断、日期校验与区间方向', () => {
  assert.deepEqual(
    parseArticleFilters({ category: 'TRO-Alert', keyword: '  Keith   案  ', from: '2025-01-01', to: '2025-01-31' }),
    { category: 'tro-alert', keyword: 'Keith 案', from: '2025-01-01', to: '2025-01-31' },
  )
  assert.deepEqual(
    parseArticleFilters(null),
    { category: '', keyword: '', from: '', to: '' },
  )
  // 非分类 slug 形态（路径穿越、空格、非法日期）一律丢弃
  assert.equal(parseArticleFilters({ category: '../etc/passwd' }).category, '')
  assert.equal(parseArticleFilters({ category: 'tro alert' }).category, '')
  assert.equal(parseArticleFilters({ from: '2024-02-31' }).from, '')
  assert.equal(parseArticleFilters({ to: 'garbage' }).to, '')
  // 区间写反时丢弃上界，避免把输入错误伪装成“没有内容”
  assert.deepEqual(
    parseArticleFilters({ from: '2025-01-31', to: '2025-01-01' }),
    { category: '', keyword: '', from: '2025-01-31', to: '' },
  )
  assert.equal(parseArticleFilters({ keyword: 'x'.repeat(200) }).keyword.length, 60)
  // h3 的 query 可能是数组，取第一个字符串
  assert.equal(parseArticleFilters({ keyword: ['飞盘', 'ignore'] }).keyword, '飞盘')
})

test('LIKE 通配符转义，用户输入不会变成隐式通配匹配', () => {
  assert.equal(escapeLikePattern('100%_off!'), '100!%!_off!!')
  assert.equal(escapeLikePattern('飞盘 Keith'), '飞盘 Keith')
  assert.equal(escapeLikePattern(''), '')
})

test('公开文章搜索只查标题与正文，不查询文章摘要字段', async () => {
  const sql = await (await import('node:fs/promises')).readFile(
    new URL('../server/utils/public/article-sql.ts', import.meta.url),
    'utf8',
  )
  const filterSection = sql.slice(sql.indexOf('export function buildArticleFilterSql'), sql.indexOf('export interface ArticleCountRow'))
  assert.doesNotMatch(filterSection, /a\.summary/)
  assert.match(filterSection, /a\.title/)
  assert.match(filterSection, /a\.content_text/)
  assert.match(filterSection, /params\.push\(like, like\)/)
  assert.match(sql, /wai\.source_url/)
})

test('公众号文章链接只允许指向公众号原文，并在卡片使用封面图和原文地址', () => {
  const sourceUrl = 'https://mp.weixin.qq.com/s/abc123?from=album#wechat_redirect'
  assert.equal(toWechatArticleUrl(sourceUrl), 'https://mp.weixin.qq.com/s/abc123?from=album')
  assert.equal(toWechatArticleUrl('https://evil.example.com/s/abc123'), null)
  assert.equal(toWechatArticleUrl('javascript:alert(1)'), null)
  assert.equal(toArticleSourceUrl('https://daxinfawu.com/tro/1123.html'), 'https://daxinfawu.com/tro/1123.html')
  assert.equal(toArticleSourceUrl('https://evil.example.com/tro/1123.html'), null)
  assert.equal(toArticleSourceUrl('https://daxinfawu.com/uploadfile/a.png'), null)

  const summary = toArticleSummary({
    id: 1,
    slug: 'wechat-article',
    title: '公众号列表文章',
    category_slug: 'labor-case',
    category_name: '劳动纠纷',
    published_at: '2026-10-20',
    source_url: sourceUrl,
    cover_url: 'https://cdn.example.com/cover.jpg',
    image_url: 'https://cdn.example.com/body.jpg',
  })
  assert.equal(summary.category, '劳动纠纷')
  assert.equal(summary.href, 'https://mp.weixin.qq.com/s/abc123?from=album')
  assert.equal(summary.imageSrc, 'https://cdn.example.com/cover.jpg')
})

test('迁移文章从已验证旧站路径跳转原文', () => {
  const summary = toArticleSummary({
    id: 1123,
    slug: 'legacy-1123',
    title: '旧站文章',
    category_slug: 'tro-alert',
    published_at: '2026-10-20',
    source_url: 'https://daxinfawu.com/tro/1123.html',
    cover_url: 'https://cdn.example.com/cover.jpg',
  })
  assert.equal(summary.href, 'https://daxinfawu.com/tro/1123.html')
  assert.equal(summary.imageSrc, 'https://cdn.example.com/cover.jpg')
})

test('配图选择：封面 OSS 地址 → 正文首图 OSS 地址 → 原文 https 外链 → null', () => {
  assert.equal(
    pickArticleImageSrc({
      coverUrl: 'https://cdn.example.com/cover.png',
      imageUrl: 'https://cdn.example.com/first.png',
      sourceUrl: 'https://old.example.com/raw.png',
    }),
    'https://cdn.example.com/cover.png',
  )
  assert.equal(
    pickArticleImageSrc({ coverUrl: '', imageUrl: 'https://cdn.example.com/first.png', sourceUrl: 'https://old.example.com/raw.png' }),
    'https://cdn.example.com/first.png',
  )
  assert.equal(
    pickArticleImageSrc({ sourceUrl: 'https://old.example.com/raw.png' }),
    'https://old.example.com/raw.png',
  )
  assert.equal(pickArticleImageSrc({ imageUrl: '//cdn.example.com/protocol-relative.png' }), 'https://cdn.example.com/protocol-relative.png')
})

test('旧站 res/... 本地路径绝不作为图片地址返回', () => {
  const legacy = 'res/202501/03/bbfd4329be1015e6_25_1.png'
  assert.equal(toPublicImageUrl(legacy), null)
  assert.equal(toPublicImageUrl('/images/legacy/res/202501/03/a.png'), null)
  assert.equal(pickArticleImageSrc({ coverUrl: legacy, imageUrl: legacy, sourceUrl: legacy }), null)
  // 原文外链只接受 https：http 会被 https 页面判为混合内容
  assert.equal(pickArticleImageSrc({ sourceUrl: 'http://old.example.com/raw.png' }), null)
  // 危险协议一律拒绝
  for (const url of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'vbscript:msgbox(1)', 'file:///etc/passwd', '']) {
    assert.equal(toPublicImageUrl(url), null, url)
  }
})

test('列表映射：日期、详情路径、配图字段，且不泄漏摘要与内部迁移字段', () => {
  const summary = toArticleSummary({
    id: 288,
    slug: 'frisbee-24-7',
    title: 'Frisbee 飞盘商标再发案',
    summary: '',
    content_text: '正文'.repeat(100),
    published_at: '2025-01-08',
    category_slug: 'tro-alert',
    category_name: 'TRO 侵权预警',
    cover_url: '',
    image_url: '',
    image_source_url: 'res/202501/03/a.png',
    image_alt: '',
  })
  assert.equal(summary.id, '288')
  assert.equal(summary.publishedAt, '2025-01-08')
  // 对外展示中文分类名，href 由分类 slug 决定
  assert.equal(summary.category, 'TRO 侵权预警')
  assert.equal(summary.href, '/tro/alerts/frisbee-24-7')
  // 标题字号：未配置时为 null（回填后有值则为 22 之类）
  assert.equal(summary.titleFontSize, null)
  assert.equal(summary.imageSrc, null)
  assert.equal(summary.imageAlt, 'Frisbee 飞盘商标再发案')
  // 即使旧行仍带摘要或正文纯文本，也不进入公开响应。
  assert.deepEqual(
    Object.keys(summary).sort(),
    ['category', 'href', 'id', 'imageAlt', 'imageSrc', 'publishedAt', 'slug', 'title', 'titleFontSize'],
  )
  assert.equal(articleHref('tro-success', 'x'), '/tro/success-cases/x')
  assert.equal(articleHref('news', 'x'), '/tro/news/x')
  assert.equal(articleHref('unknown-category', 'x'), '/tro/news/x')
  // 配图有 OSS 地址时优先使用
  const withImage = toArticleSummary({
    id: '1',
    slug: 's',
    title: 't',
    summary: '摘要',
    published_at: '2025-02-01',
    category_slug: 'news',
    cover_url: 'https://cdn.example.com/cover.png',
    image_alt: '封面',
  })
  assert.equal(withImage.imageSrc, 'https://cdn.example.com/cover.png')
  assert.equal(withImage.imageAlt, '封面')
  // 分类名缺失时回落到 slug，而不是留空
  assert.equal(withImage.category, 'news')
})

test('CPSC 与跨境咨询栏目按新分类查询并为文章生成原栏目详情路径', () => {
  const cpsc = findContentSection('/tro/cpsc-recalls')
  const crossBorder = findContentSection('/domestic/cross-border-news')
  assert.equal(cpsc?.category, 'cpsc-recalls')
  assert.equal(crossBorder?.category, 'cross-border-consulting')
  assert.equal(crossBorder?.title, '跨境咨询')
  assert.equal(articleHref('cpsc-recalls', 'recall-article'), '/tro/cpsc-recalls/recall-article')
  assert.equal(articleHref('cross-border-consulting', 'consulting-article'), '/domestic/cross-border-news/consulting-article')
})

test('服务端清洗：去掉 script、iframe、事件属性、style 与危险链接', () => {
  const dirty = [
    '<div onclick="alert(1)" style="color:red">',
    '<script>alert("x")</script>',
    '<style>body{display:none}</style>',
    '<iframe src="https://evil.example.com"></iframe>',
    '<p class="a">正文</p>',
    '<a href="javascript:alert(1)">危险链接</a>',
    '<a href="https://daxin.example.com/about">安全链接</a>',
    '<img src="https://cdn.example.com/a.png" onerror="alert(1)">',
    '<img src="res/202501/03/a.png">',
    '</div>',
  ].join('')
  const clean = sanitizeHtml(dirty)

  for (const forbidden of ['<script', '<style', '<iframe', 'onerror', 'onclick', 'style=', 'javascript:', 'res/202501/03/a.png']) {
    assert.ok(!clean.includes(forbidden), `未清除：${forbidden} → ${clean}`)
  }
  assert.ok(clean.includes('<p>正文</p>'))
  assert.ok(clean.includes('href="https://daxin.example.com/about"'))
  assert.ok(clean.includes('rel="noopener noreferrer"'))
  assert.ok(clean.includes('src="https://cdn.example.com/a.png"'))
  assert.ok(clean.includes('<div>') && clean.includes('</div>'))
})

test('服务端清洗：data: 地址、未闭合 script 与转义后的文本', () => {
  assert.equal(sanitizeHtml('<p>前</p><script>var a = 1 < 2'), '<p>前</p>')
  const html = sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="x"><a href="//cdn.example.com/x">协议相对</a>')
  assert.ok(!html.includes('data:'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('href="https://cdn.example.com/x"'))
  // 文本中的裸尖括号会被转义，不会重新变成标签
  assert.equal(sanitizeHtml('a < b & c'), 'a &lt; b &amp; c')
})
