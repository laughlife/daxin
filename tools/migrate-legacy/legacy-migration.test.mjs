// Task 3 验收测试：旧库只读解析、HTML 清洗与核验队列。
//
// 这些测试不连接数据库，只验证纯函数行为，因此可以在任何环境运行。
// 真实旧库的 dry-run 报告由 legacy-migrate.mjs --dry-run 生成。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CASE_NUMBER_PATTERN,
  buildArticleSlug,
  decodeEntities,
  extractCaseCandidates,
  extractMediaReferences,
  htmlToPlainText,
  normalizeCaseNumber,
  parseDateText,
  parseLegacyArticle,
  sanitizeHtml,
  slugify,
  stripLegacyUgc,
} from './legacy-parser.mjs'

const richArticle = {
  legacy_source_table: 'cn_list',
  legacy_source_id: '91',
  title: 'TRO案件维权成功',
  dateline: '1705296882',
  content: [
    '<p style="padding:0">案件详情</p>',
    '<p>案件号：23-cv-774</p>',
    '<p>立案时间：2023-01-30</p>',
    '<p>原告：RUN-TIGER LLC, d/b/a RUN-CHICKEN</p>',
    '<p>代理律所：THOITS LAW</p>',
    '<p><img src="res/202403/27/abf5e49beb7ee5a9.jpg" title="41" style=""/></p>',
    '<script>alert(1)</script>',
    '<p onclick="evil()">恶意属性</p>',
    '<p><a href="javascript:void(0)">危险链接</a></p>',
  ].join(''),
}

test('HTML 实体解码覆盖常见实体与数字实体', () => {
  assert.equal(decodeEntities('&amp;&lt;&gt;&quot;&#39;&nbsp;'), '&<>"\' ')
  assert.equal(decodeEntities('&#x4e2d;&#25991;'), '中文')
  assert.equal(decodeEntities('A &amp;amp; B'), 'A &amp; B')
})

test('HTML 转纯文本保留标签边界，避免字段粘连', () => {
  const text = htmlToPlainText('<p>案件号：23-cv-774</p><p>原告：RUN-TIGER LLC</p>')
  assert.match(text, /案件号：23-cv-774\n/)
  assert.match(text, /原告：RUN-TIGER LLC/)
  assert.doesNotMatch(text, /<\/?p>/)
})

test('清洗后移除脚本、事件属性、样式与危险链接', () => {
  const dirty = [
    '<div style="color:red" onclick="evil()">正文</div>',
    '<script>alert(1)</script>',
    '<iframe src="http://evil.example/a"></iframe>',
    '<a href="javascript:void(0)">危险</a>',
    '<a href="https://daxin.example/ok">正常</a>',
    '<img src="res/202403/27/x.jpg" onerror="evil()"/>',
  ].join('')
  const clean = sanitizeHtml(dirty)
  assert.doesNotMatch(clean, /<script/i)
  assert.doesNotMatch(clean, /<iframe/i)
  assert.doesNotMatch(clean, /onclick|onerror/i)
  assert.doesNotMatch(clean, /style=/i)
  assert.doesNotMatch(clean, /javascript:/i)
  assert.match(clean, /正文/)
  assert.match(clean, /https:\/\/daxin\.example\/ok/)
})

test('清洗保留正文图片 src 供后续关联 OSS 资源', () => {
  const clean = sanitizeHtml('<p><img src="res/202403/27/abf5e49beb7ee5a9.jpg" title="41"/></p>')
  assert.match(clean, /<img[^>]+src="res\/202403\/27\/abf5e49beb7ee5a9\.jpg"/)
  assert.match(clean, /alt="41"/)
})

test('案件号归一化统一大小写并补零到四位', () => {
  assert.equal(normalizeCaseNumber('24-CV-0006'), '24-cv-0006')
  assert.equal(normalizeCaseNumber('24-cv-1006'), '24-cv-1006')
  assert.equal(normalizeCaseNumber('23-cv-251'), '23-cv-0251')
  assert.equal(normalizeCaseNumber('22-cv-62369'), '22-cv-62369')
  // 旧站序号长度不统一（251 与 62369 并存），统一补零到四位，超过四位保持原样。
  assert.equal(normalizeCaseNumber(' 24 - cv - 1234 '), '24-cv-1234')
  assert.equal(normalizeCaseNumber('24-cv-12345'), '24-cv-12345')
  assert.equal(normalizeCaseNumber('2023-cv-04187'), '2023-cv-04187')
  assert.equal(normalizeCaseNumber('不是案件号'), '')
})

test('案件号正则能识别全角与空格分隔写法', () => {
  assert.match('案件号：２４-cv-01889', CASE_NUMBER_PATTERN)
  assert.equal(normalizeCaseNumber('案件号：２４-cv-01889'), '24-cv-01889')
})

test('解码 CMS 实体编码的 TRO 正文并按案件信息区块提取完整案件', async () => {
  const { extractTroCaseEntries } = await import('./legacy-parser.mjs')
  const encoded = [
    '&lt;p&gt;Wham-O品牌商标维权&lt;/p&gt;',
    '&lt;p&gt;案件信息&lt;/p&gt;',
    '&lt;p&gt;案件号：2023-cv-04187&lt;/p&gt;',
    '&lt;p&gt;起诉时间：2023年6月29日&lt;/p&gt;',
    '&lt;p&gt;原告：Wham-O Holding, Ltd&lt;/p&gt;',
    '&lt;p&gt;代理律所：Keith&lt;/p&gt;',
    '&lt;p&gt;受理法院：伊利诺伊州北区联邦法院&lt;/p&gt;',
    '&lt;p&gt;涉案信息&lt;/p&gt;',
    '&lt;p&gt;Wham-O 是知名玩具品牌，拥有 Frisbee 等产品品牌。&lt;/p&gt;',
    '&lt;p&gt;产品展示&lt;/p&gt;',
    '&lt;p&gt;Noga Levi版权图&lt;/p&gt;',
    '&lt;p&gt;案件信息&lt;/p&gt;',
    '&lt;p&gt;案件号：26-cv-02154&lt;/p&gt;',
    '&lt;p&gt;原告：Noga Levi&lt;/p&gt;',
    '&lt;p&gt;代理律所：Keith&lt;/p&gt;',
    '&lt;p&gt;涉案信息&lt;/p&gt;',
    '&lt;p&gt;插画师 Noga Levi 的作品。&lt;/p&gt;',
    '&lt;p&gt;产品展示&lt;/p&gt;',
  ].join('')
  const entries = extractTroCaseEntries('TRO案例', encoded)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].caseNumber, '2023-cv-04187')
  assert.equal(entries[0].filedAt, '2023-06-29')
  assert.equal(entries[0].plaintiff, 'Wham-O Holding, Ltd')
  assert.equal(entries[0].lawFirmName, 'Keith')
  assert.equal(entries[0].brandName, 'Wham-O Holding, Ltd')
  assert.equal(entries[0].brandSummary, 'Wham-O 是知名玩具品牌，拥有 Frisbee 等产品品牌。')
  assert.deepEqual(entries[0].ipTypes, ['trademark'])
  assert.ok(entries[1].missingFields.includes('filedAt'))
})

test('案号块中的占位原告、律所或日期不视为字段齐全', async () => {
  const { extractTroCaseEntries } = await import('./legacy-parser.mjs')
  const html = [
    '<p>测试商标维权</p><p>案件号：26-cv-12345</p>',
    '<p>起诉时间：2026年1月2日</p><p>原告：匿名</p>',
    '<p>代理律所：暂未披露</p><p>案件分析</p><p>此案为商标维权</p>',
  ].join('')
  const [candidate] = extractTroCaseEntries('TRO案例', html)
  assert.equal(candidate.complete, false)
  assert.ok(candidate.missingFields.includes('plaintiff'))
  assert.ok(candidate.missingFields.includes('lawFirmName'))
})

test('日期解析支持多种旧站写法', () => {
  assert.equal(parseDateText('2023-01-30'), '2023-01-30')
  assert.equal(parseDateText('2023/2/2'), '2023-02-02')
  assert.equal(parseDateText('2023.1.15'), '2023-01-15')
  assert.equal(parseDateText('2022年12月19日'), '2022-12-19')
  assert.equal(parseDateText('2023-13-45'), null)
  assert.equal(parseDateText('没有日期'), null)
  assert.equal(parseDateText(''), null)
})

test('从带标签正文提取完整案件候选', () => {
  const candidates = extractCaseCandidates(richArticle.title, richArticle.content)
  assert.equal(candidates.length, 1)
  const [candidate] = candidates
  assert.equal(candidate.caseNumber, '23-cv-0774')
  assert.equal(candidate.filedAt, '2023-01-30')
  assert.equal(candidate.plaintiff, 'RUN-TIGER LLC, d/b/a RUN-CHICKEN')
  assert.equal(candidate.lawFirmName, 'THOITS LAW')
  assert.equal(candidate.confidence, 1)
  assert.deepEqual(candidate.missingFields, [])
})

test('标题可提供案件号，正文提供其余字段', () => {
  const candidates = extractCaseCandidates(
    'TRO案件 24-cv-01636 商标维权',
    '<p>立案时间：2024.3.5</p><p>原告：KANGOL LLC</p><p>代理律所：GBC</p>',
  )
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].caseNumber, '24-cv-01636')
  assert.equal(candidates[0].filedAt, '2024-03-05')
  assert.equal(candidates[0].plaintiff, 'KANGOL LLC')
  assert.equal(candidates[0].lawFirmName, 'GBC')
})

test('一篇文章含多个案件号时逐个生成候选并统计缺失字段', () => {
  const candidates = extractCaseCandidates(
    '卖家过了个年！24-cv-00999、24-cv-1006、24-cv-01297、24-cv-80174',
    '<p>代理律所：Keith</p><p>原告：Ayaka Inoue</p>',
  )
  assert.deepEqual(
    candidates.map((candidate) => candidate.caseNumber),
    ['24-cv-00999', '24-cv-1006', '24-cv-01297', '24-cv-80174'],
  )
  // 同一段元信息可复用到多个案件号，但缺少立案时间，必须进入核验。
  for (const candidate of candidates) {
    assert.equal(candidate.plaintiff, 'Ayaka Inoue')
    assert.equal(candidate.lawFirmName, 'Keith')
    assert.ok(candidate.missingFields.includes('filedAt'))
    assert.ok(candidate.confidence < 1)
  }
})

test('无案件号时返回空数组，不猜测', () => {
  assert.deepEqual(extractCaseCandidates('大信法务团队介绍', '<p>我们提供专业服务</p>'), [])
})

test('正文中的案件号上下文能补充缺失字段', () => {
  const candidates = extractCaseCandidates('TRO 案件汇总', '<p>案件号：22-cv-62369</p><p>原告人：Yifeng Luo</p><p>代理律所：Jared W. Gasman Attorney, P.A.</p>')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].plaintiff, 'Yifeng Luo')
  assert.equal(candidates[0].lawFirmName, 'Jared W. Gasman Attorney, P.A.')
})

test('图片引用抽取去重并保留出现顺序', () => {
  const refs = extractMediaReferences([
    '<img src="res/202403/27/a.jpg"/>',
    '<img src="res/202403/27/b.png"/>',
    '<img src="res/202403/27/a.jpg"/>',
    '<img src="https://cdn.example/c.jpg"/>',
  ].join(''))
  assert.deepEqual(refs.map((ref) => ref.sourcePath), [
    'res/202403/27/a.jpg',
    'res/202403/27/b.png',
    'https://cdn.example/c.jpg',
  ])
  assert.equal(refs[0].position, 0)
  assert.equal(refs[2].isExternal, true)
  assert.equal(refs[0].isExternal, false)
})

test('危险图片地址被拒绝，不进入媒体引用', () => {
  const refs = extractMediaReferences('<img src="javascript:alert(1)"/><img src="data:image/png;base64,AAAA"/>')
  assert.deepEqual(refs, [])
})

test('清除非正文模块：在线留言、导航残留与多余脚本片段', () => {
  const text = stripLegacyUgc('正文内容\n在线留言\n姓名：张三\n电话：13800000000\n提交')
  assert.match(text, /正文内容/)
  assert.doesNotMatch(text, /13800000000/)
})

test('slug 生成稳定且对中文可用', () => {
  assert.equal(slugify('TRO Case 24-cv-0006!'), 'tro-case-24-cv-0006')
  assert.equal(slugify('中文标题'), slugify('中文标题'))
  assert.ok(slugify('中文标题').length > 0)
  assert.match(slugify('   '), /^legacy-/)
})

test('parseLegacyArticle 产出完整结构', () => {
  const article = parseLegacyArticle(richArticle, { legacyProjectTitle: 'TRO侵权案例' })
  assert.equal(article.sourceTable, 'cn_list')
  assert.equal(article.sourceId, '91')
  assert.equal(article.title, 'TRO案件维权成功')
  assert.match(article.contentHtml, /案件详情/)
  assert.doesNotMatch(article.contentHtml, /<script/i)
  assert.equal(article.publishedAt, '2024-01-15 13:34:42')
  assert.equal(article.sourceProjectTitle, 'TRO侵权案例')
  assert.equal(article.caseCandidates.length, 1)
  assert.equal(article.mediaReferences.length, 1)
  assert.ok(article.slug.length > 0)
  assert.ok(!Object.hasOwn(article, 'summary'), '旧站解析不再生成文章摘要')
})

test('只有 TRO案例 栏目参与案件实体抽取', () => {
  const article = parseLegacyArticle({
    legacy_source_table: 'dr_1_news',
    legacy_source_id: '1900',
    categoryName: '跨境干货',
    isTroEntitySource: false,
    title: '公开案件分析 26-cv-12345',
    content: '<p>案件号：26-cv-12345</p><p>起诉时间：2026年1月2日</p><p>原告：Example LLC</p><p>代理律所：Keith</p>',
  })
  assert.deepEqual(article.caseCandidates, [])
})

test('parseLegacyArticle 对缺正文的文章返回可核验标记', () => {
  const article = parseLegacyArticle({
    legacy_source_table: 'cn_list',
    legacy_source_id: '999',
    title: '空正文文章',
    dateline: '0',
    content: '',
  })
  assert.equal(article.contentHtml, '')
  assert.equal(article.hasContent, false)
  assert.equal(article.publishedAt, null)
  assert.ok(article.reviewReasons.includes('empty_content'))
})

test('parseLegacyArticle 标题为空时给出核验原因', () => {
  const article = parseLegacyArticle({
    legacy_source_table: 'cn_list',
    legacy_source_id: '1000',
    title: '',
    dateline: '1705296882',
    content: '<p>有正文但没标题</p>',
  })
  assert.ok(article.reviewReasons.includes('empty_title'))
})

test('buildArticleSlug 冲突时追加来源 ID 保证唯一', () => {
  const first = buildArticleSlug('相同的标题', 'cn_list', '1', new Set())
  const second = buildArticleSlug('相同的标题', 'cn_list', '2', new Set([first]))
  assert.notEqual(first, second)
  assert.ok(second.includes('2'))
})
