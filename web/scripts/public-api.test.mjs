// 公开 API 纯逻辑单测：分页夹取、查询参数解析、CaseRecord 映射。
//
// 这些函数不访问数据库（见 web/server/utils/public/query.ts 与 case-mapper.ts），
// 因此可以用 node:test 直接覆盖边界，不需要 MySQL 连接。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  PublicApiError,
  apiErrorCode,
  apiErrorMessage,
  httpStatusOf,
  isNotFoundError,
  positiveInt,
} from '../app/utils/publicApi.ts'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildCaseFilterSql,
  buildBrandDirectoryFilterSql,
  normalizeDateOnly,
  normalizePage,
  normalizePageSize,
  parseCaseQuery,
  parseBrandDirectoryQuery,
  placeholdersFor,
  resolvePageWindow,
  toSafeNumericIds,
} from '../server/utils/public/query.ts'
import {
  CASE_TYPE_LABELS,
  caseTypeLabel,
  beijingDateOnly,
  isRecentFiledAt,
  mapCaseRecord,
  toDateOnly,
} from '../server/utils/public/case-mapper.ts'

test('caseTypeLabel：未标注类型显示“待确认类型”，绝不显示具体类型', () => {
  assert.equal(caseTypeLabel('trademark'), '商标')
  assert.equal(caseTypeLabel('patent'), '专利')
  assert.equal(caseTypeLabel('copyright'), '版权')
  // 库中 unknown（待确认类型）与空值都必须显示为待确认
  assert.equal(caseTypeLabel('unknown'), '待确认类型')
  assert.equal(caseTypeLabel(''), '待确认类型')
  assert.equal(caseTypeLabel(undefined), '待确认类型')
  assert.equal(caseTypeLabel(null), '待确认类型')
  assert.equal(caseTypeLabel('Trademark'), '商标', '大小写不敏感')
  assert.notEqual(caseTypeLabel('unknown'), '商标')
})

test('品牌库查询：规范化关键词、分类和分页参数', () => {
  assert.deepEqual(parseBrandDirectoryQuery({
    q: '  2023-cv-04187  ', type: 'patent', page: '3', pageSize: '50',
  }), {
    keyword: '2023-cv-04187', caseType: 'patent', page: 3, pageSize: 50,
  })
  assert.deepEqual(parseBrandDirectoryQuery({ keyword: ['Keith', 'other'], type: 'bad', page: 0, pageSize: 999 }), {
    keyword: 'Keith', caseType: '', page: 1, pageSize: 50,
  })
  assert.equal(parseBrandDirectoryQuery().pageSize, 20)
})

test('品牌库过滤：关键词覆盖品牌自身字段与聚合出的案件命中，用户输入只通过 SQL 参数传递', () => {
  const keyword = "Keith' OR 1=1 --"
  const filter = buildBrandDirectoryFilterSql(parseBrandDirectoryQuery({ keyword, type: 'copyright' }))
  assert.match(filter.sql, /b\.name LIKE \?/)
  // 案件号 / 律所的命中在聚合阶段算好（keyword_hit），过滤时不再回表扫案件
  assert.match(filter.sql, /agg\.keyword_hit = 1/)
  assert.match(filter.sql, /FIND_IN_SET\(\?, agg\.case_types\) > 0/)
  assert.doesNotMatch(filter.sql, /case_brands|cb\.brand_id/)
  assert.doesNotMatch(filter.sql, /Keith|OR 1=1/)
  // 3 个品牌字段参数 + 1 个类型参数
  assert.equal(filter.params.filter((p) => p === `%${keyword}%`).length, 3)
  assert.equal(filter.params[filter.params.length - 1], 'copyright')
})

test('页码夹取：0、负数、非整数与非法值都回落到合法页码', () => {
  assert.equal(normalizePage(0), 1)
  assert.equal(normalizePage(-7), 1)
  assert.equal(normalizePage(-0.5), 1)
  assert.equal(normalizePage(2.9), 2)
  assert.equal(normalizePage('3'), 3)
  assert.equal(normalizePage('2.7'), 2)
  assert.equal(normalizePage('abc'), 1)
  assert.equal(normalizePage(''), 1)
  assert.equal(normalizePage(undefined), 1)
  assert.equal(normalizePage(null), 1)
  assert.equal(normalizePage(Number.NaN), 1)
  assert.equal(normalizePage(Number.POSITIVE_INFINITY), 1)
  assert.equal(normalizePage(999), 999)
})

test('每页条数夹取：显式 0 / 负数落到 1，上限 48，缺省 12', () => {
  assert.equal(normalizePageSize(undefined), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize(''), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize('abc'), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize(null), DEFAULT_PAGE_SIZE)
  assert.equal(normalizePageSize(0), 1)
  assert.equal(normalizePageSize(-5), 1)
  assert.equal(normalizePageSize(1), 1)
  assert.equal(normalizePageSize(2.9), 2)
  assert.equal(normalizePageSize(48), 48)
  assert.equal(normalizePageSize(50), 48)
  assert.equal(normalizePageSize(999), MAX_PAGE_SIZE)
  assert.equal(normalizePageSize('1000'), MAX_PAGE_SIZE)
})

test('TRO 案件分页允许 50 条，其他公开列表默认仍限制为 48 条', () => {
  const caseQuery = parseCaseQuery({ pageSize: 50 })
  assert.equal(caseQuery.pageSize, 50)
  assert.equal(resolvePageWindow(120, 1, caseQuery.pageSize, 50).pageSize, 50)
  assert.equal(resolvePageWindow(120, 1, 50).pageSize, 48)
})

test('分页窗口：正常页给出正确的 offset 与总页数', () => {
  const window = resolvePageWindow(832, 1, 12)
  assert.deepEqual(window, { page: 1, pageSize: 12, total: 832, totalPages: 70, offset: 0, beyondLastPage: false })

  const middle = resolvePageWindow(832, 3, 12)
  assert.equal(middle.page, 3)
  assert.equal(middle.offset, 24)
  assert.equal(middle.beyondLastPage, false)

  const last = resolvePageWindow(832, 70, 12)
  assert.equal(last.page, 70)
  assert.equal(last.offset, 828)
  assert.equal(last.beyondLastPage, false)
})

test('分页窗口：页码超过最后一页时夹到最后一页并标记越界', () => {
  const window = resolvePageWindow(100, 999, 12)
  assert.equal(window.page, 9)
  assert.equal(window.totalPages, 9)
  assert.equal(window.total, 100)
  assert.equal(window.beyondLastPage, true)
  assert.ok(window.page <= window.totalPages)

  const exact = resolvePageWindow(24, 3, 12)
  assert.equal(exact.page, 2)
  assert.equal(exact.totalPages, 2)
  assert.equal(exact.beyondLastPage, true)
})

test('分页窗口：total=0 时返回稳定的第 1 页且不越界', () => {
  assert.deepEqual(resolvePageWindow(0, 999, 12), {
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    offset: 0,
    beyondLastPage: false,
  })
  assert.deepEqual(resolvePageWindow(0, 1, 12), {
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    offset: 0,
    beyondLastPage: false,
  })
  assert.equal(resolvePageWindow(Number.NaN, 5, 12).total, 0)
  assert.equal(resolvePageWindow(-3, 5, 12).total, 0)
})

test('分页窗口：任何输入都不会出现 page > totalPages（total > 0）', () => {
  for (const total of [1, 11, 12, 13, 100, 832]) {
    for (const page of [-3, 0, 1, 2, 7, 9999, 'abc', 2.5]) {
      for (const pageSize of [0, 1, 12, 48, 50, 999]) {
        const window = resolvePageWindow(total, page, pageSize)
        assert.ok(window.page <= window.totalPages, `${total}/${page}/${pageSize} → ${window.page}/${window.totalPages}`)
        assert.ok(window.pageSize >= 1 && window.pageSize <= MAX_PAGE_SIZE)
      }
    }
  }
})

test('查询参数解析：合并空白、丢弃空值、只保留合法侵权类型', () => {
  const parsed = parseCaseQuery({
    keyword: '  Keith   Law  ',
    caseType: 'Trademark',
    state: '  CA ',
    from: '2024-01-01',
    to: '2024-12-31',
    page: '2',
    pageSize: '24',
  })
  assert.deepEqual(parsed, {
    keyword: 'Keith Law',
    caseType: 'trademark',
    state: 'CA',
    from: '2024-01-01',
    to: '2024-12-31',
    page: 2,
    pageSize: 24,
  })
})

test('查询参数解析：空值与非法的日期/类型被丢弃但不报错', () => {
  assert.deepEqual(parseCaseQuery(undefined), {
    keyword: '',
    caseType: '',
    state: '',
    from: '',
    to: '',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const parsed = parseCaseQuery({
    keyword: '   ',
    caseType: 'unknown-type',
    state: '',
    from: '2024-02-31',
    to: '2024-2-3',
    page: 'abc',
    pageSize: '-5',
  })
  assert.equal(parsed.keyword, '')
  assert.equal(parsed.caseType, '')
  assert.equal(parsed.state, '')
  assert.equal(parsed.from, '')
  assert.equal(parsed.to, '')
  assert.equal(parsed.page, 1)
  assert.equal(parsed.pageSize, 1)
})

test('查询参数解析：数组入参取第一个字符串，其余忽略', () => {
  const parsed = parseCaseQuery({ keyword: ['keith', 'copyright'], caseType: ['copyright', 'patent'] })
  assert.equal(parsed.keyword, 'keith')
  assert.equal(parsed.caseType, 'copyright')
})

test('日期校验只接受真实存在的 YYYY-MM-DD', () => {
  assert.equal(normalizeDateOnly('2024-02-29'), '2024-02-29')
  assert.equal(normalizeDateOnly(' 2024-01-05 '), '2024-01-05')
  assert.equal(normalizeDateOnly('2023-02-29'), '')
  assert.equal(normalizeDateOnly('2024-13-01'), '')
  assert.equal(normalizeDateOnly('2024-00-10'), '')
  assert.equal(normalizeDateOnly('2024/01/05'), '')
  assert.equal(normalizeDateOnly('2024-01-05T00:00:00Z'), '')
  assert.equal(normalizeDateOnly(20240105), '')
  assert.equal(normalizeDateOnly(''), '')
})

test('过滤条件：关键字命中品牌/律所多个参数，且始终只取已发布数据', () => {
  const filter = buildCaseFilterSql(parseCaseQuery({ keyword: 'Keith', caseType: 'copyright', from: '2024-01-01', to: '2024-06-30' }))
  assert.match(filter.sql, /publish_status = 'published'/)
  assert.match(filter.sql, /c\.filed_at >= \?/)
  assert.match(filter.sql, /c\.filed_at <= \?/)
  // 14 个关键词参数（案件号/原告/品牌/律所/英文主干 + 品牌库 4 + 律所 4）
  assert.equal(filter.params.length, 17)
  assert.equal(filter.params[0], '%Keith%')
  assert.equal(filter.params[14], 'copyright')
  assert.equal(filter.params[15], '2024-01-01')
  assert.equal(filter.params[16], '2024-06-30')
  // 不应把原始输入拼进 SQL
  assert.doesNotMatch(filter.sql, /Keith/)
})

test('过滤条件：无参数时只保留已发布条件，state 不影响 SQL（数据库无该列）', () => {
  const filter = buildCaseFilterSql(parseCaseQuery({ state: 'CA' }))
  assert.equal(filter.params.length, 0)
  assert.match(filter.sql, /publish_status = 'published'/)
  assert.doesNotMatch(filter.sql, /\?/)
})

test('IN 占位符只由已校验的正整数 id 生成', () => {
  assert.deepEqual(toSafeNumericIds([1, 2, 2, '3', 0, -1, 'abc', null, undefined, 4.5, '']), [1, 2, 3])
  assert.equal(placeholdersFor([1, 2, 3]), '?, ?, ?')
  assert.equal(placeholdersFor([]), '')
})

test('映射：没有任何关联数据时仍产出合法 CaseRecord，并用空串占位', () => {
  const record = mapCaseRecord(
    {
      id: 7,
      case_number: '24-cv-0006',
      filed_at: '2024-01-15',
      plaintiff: 'DDC Technology, LLC',
      summary: '案件摘要',
    },
    { now: new Date('2025-06-01T00:00:00Z') },
  )

  assert.equal(record.id, '7')
  assert.equal(record.caseNumber, '24-cv-0006')
  assert.equal(record.filedAt, '2024-01-15')
  assert.equal(record.lawFirm, '')
  assert.equal(record.plaintiffBrand, '')
  assert.equal(record.state, '')
  assert.equal(record.caseTypes.length, 0)
  assert.deepEqual(record.caseTypes, [])
  // 未确认侵权类型时必须回退为空串，绝不能回退成某个具体类型（例如 trademark）：
  // 否则前台会把“未标注”显示成“商标”。界面统一用 caseTypeLabel() 显示“待确认类型”。
  assert.equal(record.caseType, '')
  assert.equal(CASE_TYPE_LABELS[record.caseType], undefined, '空 caseType 不应对应任何具体类型标签')
  assert.equal(record.category, '')
  // cases.status 属内部状态，不对外暴露
  assert.equal(record.status, '')
  assert.equal(record.plaintiffName, 'DDC Technology, LLC')
  assert.ok(!Object.hasOwn(record, 'summary'), '案件摘要不再进入公开案件数据')
  assert.deepEqual(record.tags, [])
  assert.equal(record.isRecent, false)
  assert.equal(record.source, undefined)
})

test('案件来源只保留可跳转标题，案件摘要不进入公开页面展示', async () => {
  const record = mapCaseRecord({
    id: 8,
    case_number: '25-cv-0008',
    filed_at: '2025-01-02',
    plaintiff: 'Example LLC',
    summary: '仅供后台保留的案件摘要',
  }, {
    source: {
      articleId: 31,
      slug: 'tro-case-update-31',
      title: 'TRO 案件进展',
      publishedAt: '2025-01-03',
      table: 'legacy_articles',
      excerpt: '来源文章摘要不在案件详情重复展示',
    },
  })
  assert.deepEqual(record.source, {
    articleId: 31,
    title: 'TRO 案件进展',
    href: '/tro-case-update-31',
  })

  for (const file of [
    '../app/components/cases/CaseCard.vue',
    '../app/components/home/CasePreviewCard.vue',
    '../app/components/content/EntityDetail.vue',
    '../app/pages/tro/cases/[id].vue',
  ]) {
    const source = await readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /(?:record|item)\.summary/, `${file} must not render case summaries`)
  }
  const caseDetail = readFileSync(new URL('../app/pages/tro/cases/[id].vue', import.meta.url), 'utf8')
  assert.match(caseDetail, /NuxtLink[^>]*:to="record\.source\.href"[\s\S]*?\{\{ record\.source\.title \}\}/)
  assert.doesNotMatch(caseDetail, /record\.source\.(?:excerpt|publishedAt)/)
  const caseQueries = readFileSync(new URL('../server/utils/public/case-queries.ts', import.meta.url), 'utf8')
  const sourceQuery = caseQueries.slice(caseQueries.indexOf('queryTarget<SourceRow>'), caseQueries.indexOf('const sources = new Map'))
  assert.match(sourceQuery, /a\.slug AS slug[\s\S]*?a\.title AS title/)
  assert.doesNotMatch(sourceQuery, /summary|excerpt|published_at/)
})

test('映射：slug 一律小写，字段缺失时不臆造内容', () => {
  const record = mapCaseRecord({
    id: '832',
    case_number: '  25-CV-00122 ',
    filed_at: null,
    plaintiff: null,
    summary: null,
  }, { now: new Date('2025-06-01T00:00:00Z') })

  assert.equal(record.slug, '25-cv-00122')
  assert.equal(record.caseNumber, '25-CV-00122')
  assert.equal(record.filedAt, '')
  assert.equal(record.plaintiffName, '')
  assert.ok(!Object.hasOwn(record, 'summary'))
  assert.equal(record.isRecent, false)
})

test('映射：关联品牌、律所与侵权类型参与分类与展示', () => {
  const record = mapCaseRecord(
    {
      id: 12,
      case_number: '24-cv-0009',
      filed_at: '2024-03-08',
      plaintiff: '示例原告',
      summary: '示例摘要',
    },
    {
      brandNames: ['DODO case'],
      lawFirmNames: ['Keith', 'Haller Law'],
      ipTypeSlugs: ['copyright', 'trademark', 'unknown'],
      now: new Date('2024-03-10T02:00:00Z'),
    },
  )

  assert.equal(record.plaintiffBrand, 'DODO case')
  assert.equal(record.lawFirm, 'Keith')
  assert.deepEqual(record.caseTypes, ['copyright', 'trademark'])
  assert.equal(record.caseType, 'copyright')
  assert.equal(record.category, '版权 / 商标侵权')
  assert.equal(record.isRecent, true)
})

test('映射：来源文章只返回可跳转标题，不返回摘要与日期', () => {
  const record = mapCaseRecord(
    { id: 1, case_number: '24-cv-0006', filed_at: '2024-01-15', plaintiff: 'DDC', summary: '' },
    {
      source: {
        articleId: 8,
        slug: 'patent-update',
        title: '  八个专利，VR 眼镜都不能卖了？  ',
        publishedAt: new Date(2024, 0, 17),
        table: 'cn_list',
        excerpt: '  摘  要  ',
      },
      now: new Date('2025-06-01T00:00:00Z'),
    },
  )

  assert.deepEqual(record.source, {
    articleId: 8,
    title: '八个专利，VR 眼镜都不能卖了？',
    href: '/patent-update',
  })

  const noTitle = mapCaseRecord(
    { id: 2, case_number: '24-cv-0007', filed_at: null, plaintiff: '', summary: '' },
    { source: { articleId: 9, slug: 'missing-title', title: '  ' } },
  )
  assert.equal(noTitle.source, undefined)
})

test('映射：filed_at 为 Date 时按本地日期还原，mysql2 常见形态不串日期', () => {
  // mysql2 把 DATE '2024-01-15' 读成本地零点的 Date
  assert.equal(toDateOnly(new Date(2024, 0, 15)), '2024-01-15')
  assert.equal(toDateOnly('2024-01-15T00:00:00.000Z'), '2024-01-15')
  assert.equal(toDateOnly(null), '')
  assert.equal(toDateOnly('not-a-date'), '')
})

test('isRecent：按北京时间判断最近 3 天', () => {
  const now = new Date('2025-01-06T02:00:00Z') // 北京 2025-01-06 10:00
  assert.equal(beijingDateOnly(now), '2025-01-06')
  assert.equal(isRecentFiledAt('2025-01-06', now), true)
  assert.equal(isRecentFiledAt('2025-01-03', now), true)
  assert.equal(isRecentFiledAt('2025-01-02', now), false)
  assert.equal(isRecentFiledAt('', now), false)

  // UTC 前一天下午已是北京次日凌晨
  const boundary = new Date('2025-01-05T16:30:00Z')
  assert.equal(beijingDateOnly(boundary), '2025-01-06')
  assert.equal(isRecentFiledAt('2025-01-06', boundary), true)
  assert.equal(isRecentFiledAt('2025-01-02', boundary), false)
})

test('错误响应解析：取出中文消息、错误码与 HTTP 状态码', () => {
  const failure = { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: '案件列表加载失败，请稍后重试' } } }
  assert.equal(httpStatusOf(failure), 500)
  assert.equal(apiErrorMessage(failure), '案件列表加载失败，请稍后重试')
  assert.equal(apiErrorCode(failure), 'INTERNAL_ERROR')

  assert.equal(apiErrorMessage({}), '')
  assert.equal(apiErrorCode({}), '')
  assert.equal(apiErrorMessage(null), '')
  assert.equal(httpStatusOf(new Error('boom')), 0)
  assert.equal(httpStatusOf(null), 0)
  assert.equal(httpStatusOf({ response: { status: 503 } }), 503)
})

test('404 判定与 meta 数值收敛', () => {
  assert.equal(isNotFoundError({ status: 404 }), true)
  assert.equal(isNotFoundError(new PublicApiError('案件不存在或尚未公开', 0, 'NOT_FOUND')), true)
  assert.equal(isNotFoundError(new PublicApiError('服务器错误', 500, 'INTERNAL_ERROR')), false)
  assert.equal(isNotFoundError({ status: 500 }), false)

  assert.equal(positiveInt(3, 12), 3)
  assert.equal(positiveInt('3', 12), 3)
  assert.equal(positiveInt(0, 12), 12)
  assert.equal(positiveInt(-1, 12), 12)
  assert.equal(positiveInt(2.5, 12), 12)
  assert.equal(positiveInt(undefined, 12), 12)
})

test('PublicApiError 是 Error 子类，页面可以直接展示中文消息', () => {
  const error = new PublicApiError('品牌详情加载失败，请稍后重试', 500, 'INTERNAL_ERROR')
  assert.ok(error instanceof Error)
  assert.equal(error.message, '品牌详情加载失败，请稍后重试')
  assert.equal(error.status, 500)
  assert.equal(error.code, 'INTERNAL_ERROR')
  assert.equal(new PublicApiError('加载失败').code, 'REQUEST_FAILED')
})

test('仓储层不引用 Mock 数据，接口失败时不回退（静态防回归）', () => {
  for (const file of ['cases.ts', 'entities.ts']) {
    const source = readFileSync(new URL(`../app/repositories/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /data\/mock/)
    assert.match(source, /\$fetch/)
  }
})
