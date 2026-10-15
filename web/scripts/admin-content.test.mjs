// 后台内容 CRUD 的纯逻辑单测：slug 生成与去重、状态归一化、案件号归一化、关联替换语句、行映射。
//
// 这些函数都不访问数据库（见 web/server/utils/admin/content-queries.ts），
// 因此可以用 node:test 直接覆盖边界，不需要 MySQL 连接。
// 最后一个用例是静态守卫：后台接口文件必须先做 requireAdmin 再做任何查库。
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { resolvePageWindow } from '../server/utils/public/query.ts'
const articleAdminSource = await readFile(new URL('../app/pages/admin/articles.vue', import.meta.url), 'utf8')
const caseAdminSource = await readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8')
import {
  ADMIN_ARTICLE_COUNT_SQL,
  ADMIN_ARTICLE_LIST_SQL,
  ARTICLE_WRITABLE_COLUMNS,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  BRAND_WRITABLE_COLUMNS,
  CASE_WRITABLE_COLUMNS,
  LAW_FIRM_WRITABLE_COLUMNS,
  adminPageSize,
  buildArticleAdminFilterSql,
  buildCaseAdminFilterSql,
  buildCaseRelationStatements,
  buildEntityAdminFilterSql,
  buildUpdateStatement,
  ensureUniqueSlug,
  filterEntityStatus,
  mapAdminArticleRow,
  mapAdminCaseDetail,
  mapAdminCaseRow,
  mapAdminEntityRow,
  normalizeCaseNumber,
  normalizeContentStatus,
  normalizePublishStatus,
  parseCaseNumberParts,
  parseCaseRelations,
  parseContentStatus,
  parseDateInput,
  parseDateTimeInput,
  parseEntityStatus,
  pickChangedFields,
  readContentStatus,
  slugifyTitle,
  sqlNow,
  toBooleanFlag,
  toDateTimeText,
  toNullableId,
  toRouteId,
  toText,
} from '../server/utils/admin/content-queries.ts'

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

test('slugifyTitle：中文标题生成非空且稳定的 slug', () => {
  const title = 'TRO 预警：跨境电商商标侵权应对'
  const slug = slugifyTitle(title)
  assert.ok(slug.length > 0, '中文标题也必须得到非空 slug')
  assert.equal(slug, slugifyTitle(title), '同标题必须得到同一个 slug')
  assert.match(slug, /^[a-z0-9-]+$/, 'slug 只能是 URL 安全字符')
  assert.ok(!/[\u4e00-\u9fa5]/.test(slug), 'slug 不应包含中文字符')
  // 不同中文标题必须得到不同 slug（哈希段参与）
  assert.notEqual(slug, slugifyTitle('TRO 预警：跨境电商专利侵权应对'))
})

test('slugifyTitle：纯 ASCII 标题保持可读，空标题回落到 legacy- 前缀', () => {
  assert.equal(slugifyTitle('Hello, World!'), 'hello-world')
  assert.equal(slugifyTitle('  TRO  Alert  '), 'tro-alert')
  const empty = slugifyTitle('')
  assert.match(empty, /^legacy-[0-9a-f]{8}$/, '空标题必须回落到 legacy-<hash> 形态')
  assert.equal(empty, slugifyTitle('   '), '空标题的兜底 slug 必须稳定')
})

test('ensureUniqueSlug：未冲突原样返回，冲突追加数字后缀，全部占用时仍有唯一结果', () => {
  assert.equal(ensureUniqueSlug('tro-alert', []), 'tro-alert')
  assert.equal(ensureUniqueSlug('tro-alert', ['other']), 'tro-alert')
  assert.equal(ensureUniqueSlug('tro-alert', ['tro-alert']), 'tro-alert-2')
  assert.equal(ensureUniqueSlug('tro-alert', ['TRO-ALERT', 'tro-alert-2']), 'tro-alert-3', '占用判断大小写不敏感')
  const taken = ['legacy-abc', 'legacy-abc-2', 'legacy-abc-3']
  const result = ensureUniqueSlug('legacy-abc', taken)
  assert.ok(!taken.includes(result))
  assert.ok(result.startsWith('legacy-abc-'))
})

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

test('状态归一化：只接受白名单取值，缺省与非法输入回落默认值', () => {
  assert.equal(normalizeContentStatus('published'), 'published')
  assert.equal(normalizeContentStatus('PUBLISHED'), 'published', '大小写不敏感')
  assert.equal(normalizeContentStatus(' draft '), 'draft')
  assert.equal(normalizeContentStatus('archived'), 'archived')
  // 默认值：缺省 / 非法都回落到 'draft'（新建内容不应默认发布）
  assert.equal(normalizeContentStatus(undefined), 'draft')
  assert.equal(normalizeContentStatus(null), 'draft')
  assert.equal(normalizeContentStatus(''), 'draft')
  assert.equal(normalizeContentStatus('deleted'), 'draft')
  assert.equal(normalizeContentStatus('published', 'archived'), 'published')
  assert.equal(normalizeContentStatus('nonsense', 'archived'), 'archived', '可显式指定缺省值')

  // 写接口用 parseContentStatus 严格校验：非法值必须是 null，由调用方回 400
  assert.equal(parseContentStatus('deleted'), null)
  assert.equal(parseContentStatus(''), 'draft')
  assert.equal(parseContentStatus('draft'), 'draft')
  // 案例的 publish_status 与文章共用取值，默认同样是 'draft'
  assert.equal(normalizePublishStatus('archived'), 'archived')
  assert.equal(normalizePublishStatus(undefined), 'draft')
  assert.equal(normalizePublishStatus('open'), 'draft')
  // 读取（行映射）用 readContentStatus：非法值返回空串，不假装成 draft
  assert.equal(readContentStatus('deleted'), '')
  assert.equal(readContentStatus(null), '')

  // 品牌 / 律所 status 是 0/1
  assert.equal(parseEntityStatus(undefined), 1)
  assert.equal(parseEntityStatus('0'), 0)
  assert.equal(parseEntityStatus('archived'), 0)
  assert.equal(parseEntityStatus('active'), 1)
  assert.equal(parseEntityStatus('7'), null)
  assert.equal(filterEntityStatus('nonsense'), null)
  assert.equal(filterEntityStatus('1'), 1)
})

// ---------------------------------------------------------------------------
// 案件号
// ---------------------------------------------------------------------------

test('案件号归一化：大小写不敏感并统一小写，非法值被拒绝', () => {
  assert.equal(normalizeCaseNumber('24-CV-0006'), '24-cv-0006')
  assert.equal(normalizeCaseNumber(' 24-cv-0006 '), '24-cv-0006')
  assert.deepEqual(parseCaseNumberParts('24-CV-0006'), { caseYear: 2024, caseSeq: 6, caseType: 'cv' })

  for (const invalid of ['', '24-cv', 'cv-0006', '24-cv-', '24-cv-abc', '2024-cv-0006', '24-cv-0006-1', '24c v0006']) {
    assert.equal(normalizeCaseNumber(invalid), '', `应拒绝案件号：${invalid}`)
    assert.equal(parseCaseNumberParts(invalid), null, `应拒绝案件号：${invalid}`)
  }
})

// ---------------------------------------------------------------------------
// 关联替换
// ---------------------------------------------------------------------------

test('buildCaseRelationStatements：三个关联都给定时，每个关联表各一条 DELETE + 一条 INSERT', () => {
  const statements = buildCaseRelationStatements(9, { brandId: 3, lawFirmId: 4, ipTypeId: 1 })
  assert.equal(statements.length, 6)

  const sql = statements.map(item => item.sql)
  assert.deepEqual(sql, [
    'DELETE FROM case_brands WHERE case_id = ?',
    'INSERT INTO case_brands (case_id, brand_id) VALUES (?, ?)',
    'DELETE FROM case_law_firms WHERE case_id = ?',
    'INSERT INTO case_law_firms (case_id, law_firm_id, is_primary) VALUES (?, ?, 1)',
    'DELETE FROM case_ip_types WHERE case_id = ?',
    'INSERT INTO case_ip_types (case_id, ip_type_id) VALUES (?, ?)',
  ])
  assert.deepEqual(statements[0].params, [9])
  assert.deepEqual(statements[1].params, [9, 3])
  assert.deepEqual(statements[3].params, [9, 4])
  assert.deepEqual(statements[5].params, [9, 1])
})

test('buildCaseRelationStatements：undefined 完全不碰该表，null 只清空不插入', () => {
  const untouched = buildCaseRelationStatements(9, { brandId: 3 })
  assert.deepEqual(untouched.map(item => item.sql), [
    'DELETE FROM case_brands WHERE case_id = ?',
    'INSERT INTO case_brands (case_id, brand_id) VALUES (?, ?)',
  ])

  const cleared = buildCaseRelationStatements(9, { brandId: null })
  assert.deepEqual(cleared.map(item => item.sql), ['DELETE FROM case_brands WHERE case_id = ?'])
  assert.deepEqual(cleared[0].params, [9])

  const mixed = buildCaseRelationStatements(9, { brandId: 3, lawFirmId: null, ipTypeId: undefined })
  assert.deepEqual(mixed.map(item => item.sql), [
    'DELETE FROM case_brands WHERE case_id = ?',
    'INSERT INTO case_brands (case_id, brand_id) VALUES (?, ?)',
    'DELETE FROM case_law_firms WHERE case_id = ?',
  ])

  // 三者都是 undefined：不产生任何语句
  assert.deepEqual(buildCaseRelationStatements(9, {}), [])
})

test('parseCaseRelations：区分「未提供」「显式清空」与「非法 id」', () => {
  assert.deepEqual(parseCaseRelations({}), { ok: true, relations: {} })
  assert.deepEqual(parseCaseRelations({ brandId: null, lawFirmId: '', ipTypeId: 2 }), {
    ok: true,
    relations: { brandId: null, lawFirmId: null, ipTypeId: 2 },
  })
  assert.deepEqual(parseCaseRelations({ brandId: '5' }), { ok: true, relations: { brandId: 5 } })
  assert.deepEqual(parseCaseRelations({ brandId: 0 }), { ok: false, field: 'brandId' })
  assert.deepEqual(parseCaseRelations({ lawFirmId: -1 }), { ok: false, field: 'lawFirmId' })
  assert.deepEqual(parseCaseRelations({ ipTypeId: 'abc' }), { ok: false, field: 'ipTypeId' })
})

// ---------------------------------------------------------------------------
// 写入白名单与 UPDATE 语句
// ---------------------------------------------------------------------------

test('可写列白名单不含只读 / 派生列', () => {
  for (const column of ['case_count', 'view_count', 'logo_media_id', 'cover_media_id']) {
    assert.ok(!ARTICLE_WRITABLE_COLUMNS.includes(column), `articles 白名单不应包含 ${column}`)
    assert.ok(!BRAND_WRITABLE_COLUMNS.includes(column), `brands 白名单不应包含 ${column}`)
    assert.ok(!LAW_FIRM_WRITABLE_COLUMNS.includes(column), `law_firms 白名单不应包含 ${column}`)
    assert.ok(!CASE_WRITABLE_COLUMNS.includes(column), `cases 白名单不应包含 ${column}`)
  }
  assert.ok(!BRAND_WRITABLE_COLUMNS.includes('region'), 'region 只属于律所')
  assert.ok(LAW_FIRM_WRITABLE_COLUMNS.includes('region'))
  assert.ok(!CASE_WRITABLE_COLUMNS.includes('summary'), '案件摘要不再由后台写入')
  for (const column of ['legacy_source_table', 'legacy_source_id', 'migration_batch_id', 'verified_at']) {
    assert.ok(!ARTICLE_WRITABLE_COLUMNS.includes(column))
    assert.ok(!CASE_WRITABLE_COLUMNS.includes(column))
  }
})

test('buildUpdateStatement：只写白名单列，请求体多余的键被忽略', () => {
  const statement = buildUpdateStatement('brands', 7, {
    name: '新名称',
    case_count: 999,
    legacy_source_id: 5,
  }, BRAND_WRITABLE_COLUMNS)
  assert.ok(statement)
  assert.equal(statement.sql, 'UPDATE brands SET name = ?, updated_at = NOW() WHERE id = ?')
  assert.deepEqual(statement.params, ['新名称', 7])

  // 没有任何可写字段变化时不生成语句（调用方据此跳过 UPDATE 与审计）
  assert.equal(buildUpdateStatement('brands', 7, { case_count: 999 }, BRAND_WRITABLE_COLUMNS), null)

  // 服务端表达式（NOW()）走字面量，其余列仍走占位符；SET 顺序由白名单决定，与请求键顺序无关
  const withExpression = buildUpdateStatement('articles', 1, { status: 'published', published_at: sqlNow() }, ARTICLE_WRITABLE_COLUMNS)
  assert.ok(withExpression)
  assert.equal(withExpression.sql, 'UPDATE articles SET published_at = NOW(), status = ?, updated_at = NOW() WHERE id = ?')
  assert.deepEqual(withExpression.params, ['published', 1])

  const changed = pickChangedFields({ name: '旧', status: 1 }, { name: '新', status: 1 })
  assert.deepEqual(changed.before, { name: '旧' })
  assert.deepEqual(changed.after, { name: '新' })
})

// ---------------------------------------------------------------------------
// 行映射
// ---------------------------------------------------------------------------

test('mapAdminCaseRow：NULL filed_at / plaintiff 收敛成空串，内部列不外泄', () => {
  const mapped = mapAdminCaseRow({
    id: 7,
    case_number: '24-cv-0006',
    filed_at: null,
    plaintiff: null,
    court: null,
    title: '内部标题',
    summary: null,
    status: 'open',
    publish_status: 'draft',
    updated_at: '2026-01-02 03:04:05',
    brand_name: null,
    law_firm_name: null,
    ip_type_slug: 'unknown',
    legacy_source_table: 'cn_list',
    legacy_source_id: 12,
    migration_batch_id: 3,
    verified_at: '2025-01-01 00:00:00',
  })

  assert.equal(mapped.filedAt, '')
  assert.equal(mapped.plaintiff, '')
  assert.equal(mapped.brand, '')
  assert.equal(mapped.lawFirm, '')
  assert.equal(mapped.court, '')
  assert.equal(mapped.caseType, 'unknown', '后台返回 ip_types.slug 原值，不做展示文案转换')
  assert.equal(mapped.publishStatus, 'draft')
  assert.equal(mapped.updatedAt, '2026-01-02 03:04:05')
  for (const key of ['legacy_source_table', 'legacy_source_id', 'migration_batch_id', 'verified_at']) {
    assert.ok(!(key in mapped), `映射结果不应包含内部列 ${key}`)
  }
  assert.ok(!Object.values(mapped).some(value => value === undefined), '映射结果不应出现 undefined')

  const detail = mapAdminCaseDetail({ id: 7, brand_id: null, law_firm_id: null, ip_type_id: null })
  assert.equal(detail.brandId, null)
  assert.equal(detail.lawFirmId, null)
  assert.equal(detail.ipTypeId, null)
  assert.equal(detail.caseNumber, '')
  assert.ok(!Object.hasOwn(detail, 'summary'), '后台案件详情不返回摘要字段')
})

test('后台案件编辑与 API 不再保留或读写案件摘要', async () => {
  assert.doesNotMatch(caseAdminSource, /case-summary|form\.summary/)
  for (const file of [
    '../server/api/admin/cases.post.ts',
    '../server/api/admin/cases/[id].get.ts',
    '../server/api/admin/cases/[id].put.ts',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /summary/, `${file} must not accept or return case summaries`)
  }
  const queries = await readFile(new URL('../server/utils/admin/content-queries.ts', import.meta.url), 'utf8')
  const caseQuerySection = queries.slice(queries.indexOf('export const ADMIN_CASE_COLUMNS'), queries.indexOf('/** 品牌 / 律所：'))
  assert.doesNotMatch(caseQuerySection, /summary/)
  assert.doesNotMatch(queries.slice(queries.indexOf('export function mapAdminCaseRow'), queries.indexOf('/** 品牌 / 律所：')), /summary/)

  const migration = await readFile(new URL('../../database/migrations/017_clear_case_summaries.sql', import.meta.url), 'utf8')
  assert.match(migration, /UPDATE\s+cases\s+SET\s+summary\s*=\s*NULL/i)

  const importer = await readFile(new URL('../../tools/migrate-legacy/legacy-import.mjs', import.meta.url), 'utf8')
  const caseImport = importer.slice(importer.indexOf('async function writeCasesAndFetchIds'), importer.indexOf('/**\n * 旧站正文没有独立的品牌字段'))
  assert.doesNotMatch(caseImport, /summary/)
})

test('mapAdminArticleRow：NULL 分类保留 null，内部列不外泄', () => {
  const mapped = mapAdminArticleRow({
    id: 3,
    slug: 'tro-alert',
    title: '标题',
    category_id: null,
    category_name: null,
    published_at: null,
    status: 'published',
    is_featured: 1,
    updated_at: null,
    legacy_source_table: 'cn_list',
    legacy_source_id: 8,
    migration_batch_id: 1,
  })
  assert.ok(!Object.hasOwn(mapped, 'summary'), '后台文章列表不返回摘要字段')
  assert.equal(mapped.categoryId, null)
  assert.equal(mapped.categoryName, '')
  assert.equal(mapped.publishedAt, '')
  assert.equal(mapped.updatedAt, '')
  assert.equal(mapped.isFeatured, true)
  assert.equal(mapped.status, 'published')
  for (const key of ['legacy_source_table', 'legacy_source_id', 'migration_batch_id', 'content_html']) {
    assert.ok(!(key in mapped), `列表映射不应包含 ${key}`)
  }
})

test('文章编辑表单隐藏推荐与侧边栏开关，但保存时保留已有字段状态', () => {
  assert.doesNotMatch(articleAdminSource, /article-featured|article-sidebar|设为推荐|在侧边栏显示/)
  assert.match(articleAdminSource, /isFeatured:\s*form\.isFeatured/)
  assert.match(articleAdminSource, /showInSidebar:\s*form\.showInSidebar/)
})

test('后台文章摘要已从表单、列表/API、预览与写入白名单移除', async () => {
  assert.ok(!ARTICLE_WRITABLE_COLUMNS.includes('summary'))
  assert.doesNotMatch(articleAdminSource, /form\.summary|article-summary|summary:\s*item\.summary|summary:\s*article\.summary/)
  for (const file of [
    '../server/api/admin/articles.post.ts',
    '../server/api/admin/articles/[id].get.ts',
    '../server/api/admin/articles/[id].put.ts',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /summary/, `${file} must not accept or return article summaries`)
  }
  const queries = await readFile(new URL('../server/utils/admin/content-queries.ts', import.meta.url), 'utf8')
  const articleQuerySection = queries.slice(queries.indexOf('export const ADMIN_ARTICLE_COLUMNS'), queries.indexOf('export const ADMIN_CASE_COLUMNS'))
  assert.doesNotMatch(articleQuerySection, /summary/)
  assert.doesNotMatch(queries.slice(queries.indexOf('export interface AdminArticleItem'), queries.indexOf('/** 后台案例列表项')), /summary/)

  const preview = await readFile(new URL('../app/components/admin/AdminArticlePreview.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(preview, /summary|摘要/)

  const migration = await readFile(new URL('../../database/migrations/018_clear_article_summaries.sql', import.meta.url), 'utf8')
  assert.match(migration, /UPDATE\s+articles\s+SET\s+summary\s*=\s*NULL/i)

  const importer = await readFile(new URL('../../tools/migrate-legacy/legacy-import.mjs', import.meta.url), 'utf8')
  const articleImport = importer.slice(importer.indexOf('阶段二：并发写入文章'), importer.indexOf('// 阶段三：并发取回文章主键'))
  assert.doesNotMatch(articleImport, /summary/)
})

test('mapAdminEntityRow：caseCount 来自统计列，status 归一化成 0/1，品牌 region 恒为空串', () => {
  const brand = mapAdminEntityRow({
    id: 1,
    slug: 'acme',
    name: 'Acme',
    name_en: 'Acme Inc.',
    aliases: 'ACME,Acme 公司',
    summary: null,
    case_count: '12',
    status: 1,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-02 00:00:00',
  })
  assert.equal(brand.caseCount, 12)
  assert.equal(brand.region, '', '品牌没有 region 列，必须是空串而不是 undefined')
  assert.equal(brand.status, 1)
  assert.equal(brand.summary, '')

  const archived = mapAdminEntityRow({ id: 2, status: 0, case_count: null })
  assert.equal(archived.status, 0)
  assert.equal(archived.caseCount, 0)
  assert.equal(archived.name, '')
})

// ---------------------------------------------------------------------------
// 解析助手
// ---------------------------------------------------------------------------

test('日期与时间入参：非法值明确失败，null / 空串表示清空', () => {
  assert.deepEqual(parseDateTimeInput(null), { ok: true, value: null })
  assert.deepEqual(parseDateTimeInput(''), { ok: true, value: null })
  assert.deepEqual(parseDateTimeInput('2026-01-02'), { ok: true, value: '2026-01-02 00:00:00' })
  assert.deepEqual(parseDateTimeInput('2026-01-02T03:04'), { ok: true, value: '2026-01-02 03:04:00' })
  assert.deepEqual(parseDateTimeInput('2026-01-02 03:04:05'), { ok: true, value: '2026-01-02 03:04:05' })
  for (const invalid of ['2026-02-30', '2026/01/02', '昨天', 20260102, '2026-01-02 25:00']) {
    assert.deepEqual(parseDateTimeInput(invalid), { ok: false }, `应拒绝：${String(invalid)}`)
  }

  assert.deepEqual(parseDateInput('2026-01-02'), { ok: true, value: '2026-01-02' })
  assert.deepEqual(parseDateInput('2026-01-02 03:04:05'), { ok: true, value: '2026-01-02' })
  assert.deepEqual(parseDateInput(null), { ok: true, value: null })
  assert.deepEqual(parseDateInput('2026-02-30'), { ok: false })
  assert.deepEqual(parseDateInput('not-a-date'), { ok: false })

  assert.equal(toDateTimeText('2026-01-02'), '2026-01-02 00:00:00')
  assert.equal(toDateTimeText(null), '')
  assert.equal(toText(null), '')
  assert.equal(toText(undefined), '')
  assert.equal(toNullableId('12'), 12)
  assert.equal(toNullableId('0'), null)
  assert.equal(toRouteId('12'), 12)
  assert.equal(toRouteId('abc'), null)
  assert.equal(toBooleanFlag('true'), true)
  assert.equal(toBooleanFlag(0), false)
})

test('后台列表分页：统一支持 10/20/30/40/50 条，接口最多返回 50 条', () => {
  assert.equal(ADMIN_DEFAULT_PAGE_SIZE, 20)
  assert.equal(ADMIN_MAX_PAGE_SIZE, 50)
  assert.equal(adminPageSize(undefined), 20)
  assert.equal(adminPageSize(null), 20)
  assert.equal(adminPageSize(''), 20)

  for (const size of [10, 20, 30, 40, 50]) {
    assert.equal(resolvePageWindow(100, 1, adminPageSize(size), ADMIN_MAX_PAGE_SIZE).pageSize, size)
  }
  assert.equal(resolvePageWindow(100, 1, adminPageSize(999), ADMIN_MAX_PAGE_SIZE).pageSize, 50, '后台接口上限为 50')
  assert.equal(resolvePageWindow(100, 1, adminPageSize(0), ADMIN_MAX_PAGE_SIZE).pageSize, 1, '下限 1 仍由共享 helper 夹取')
  const beyond = resolvePageWindow(100, 99, adminPageSize(20))
  assert.equal(beyond.beyondLastPage, true)
  assert.equal(beyond.page, 5)
  assert.equal(beyond.totalPages, 5)
})

test('后台所有分页接口使用后台 50 条上限，前端所有分页器共用五档选项', async () => {
  const adminApiSource = await readFile(new URL('../app/utils/adminApi.ts', import.meta.url), 'utf8')
  assert.match(adminApiSource, /ADMIN_MAX_PAGE_SIZE\s*=\s*50/)
  assert.match(adminApiSource, /ADMIN_PAGE_SIZE_OPTIONS[^\n]*\[10,\s*20,\s*30,\s*40,\s*50\]/)

  for (const file of ['articles.get.ts', 'cases.get.ts', 'brands.get.ts', 'law-firms.get.ts', 'media.get.ts', 'review.get.ts']) {
    const source = await readFile(new URL(`../server/api/admin/${file}`, import.meta.url), 'utf8')
    assert.match(source, /ADMIN_MAX_PAGE_SIZE/, `${file} must cap results at 50`)
    assert.match(source, /resolvePageWindow\([\s\S]*?ADMIN_MAX_PAGE_SIZE\)/, `${file} must apply the 50-row cap to its query window`)
  }
})

test('列表过滤片段：参数全部走占位符，非法筛选值被忽略', () => {  const article = buildArticleAdminFilterSql({ keyword: 'TRO', categoryId: '2', status: 'deleted' })
  assert.match(article.sql, /a\.category_id = \?/)
  assert.ok(!article.sql.includes('deleted'), '非法状态不应出现在 SQL 中')
  assert.deepEqual(article.params, ['%TRO%', '%TRO%', 2])

  const cases = buildCaseAdminFilterSql({ keyword: '', status: 'published' })
  assert.match(cases.sql, /c\.publish_status = \?/)
  assert.deepEqual(cases.params, ['published'])

  const entity = buildEntityAdminFilterSql({ status: 'archived' })
  assert.match(entity.sql, /e\.status = \?/)
  assert.deepEqual(entity.params, [0])

  assert.deepEqual(buildArticleAdminFilterSql({}), { sql: '', params: [] })
  assert.ok(ADMIN_ARTICLE_LIST_SQL.includes('FROM articles a'))
  assert.ok(ADMIN_ARTICLE_COUNT_SQL.includes('COUNT(*)'))
})

// ---------------------------------------------------------------------------
// 静态守卫
// ---------------------------------------------------------------------------

const ADMIN_API_DIR = resolve(import.meta.dirname, '../server/api/admin')
/** 公开的登录接口本来就不该要求登录态；除此之外任何查库文件都必须先 requireAdmin。 */
const PUBLIC_ENDPOINTS = new Set(['login.post.ts'])
/** 任何一次数据库访问的标记；requireAdmin 必须出现在它们之前。 */
const QUERY_MARKERS = ['queryTarget(', 'withTargetTransaction(', 'executeWrite(']

async function collectTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => (entry.isDirectory()
    ? collectTsFiles(join(dir, entry.name))
    : (entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []))))
  return nested.flat()
}

test('静态守卫：后台接口先 requireAdmin，再做任何数据库查询', async () => {
  const files = await collectTsFiles(ADMIN_API_DIR)
  assert.ok(files.length >= 20, `应扫描到后台接口文件，实际 ${files.length} 个`)

  const violations = []
  for (const file of files) {
    const name = relative(ADMIN_API_DIR, file)
    const source = await readFile(file, 'utf8')
    const authIndex = source.indexOf('requireAdmin(')
    const queryIndexes = QUERY_MARKERS.map(marker => ({ marker, index: source.indexOf(marker) }))
      .filter(item => item.index >= 0)
    if (queryIndexes.length === 0) continue
    if (PUBLIC_ENDPOINTS.has(name)) continue

    if (authIndex < 0) {
      violations.push(`${name} 查库但没有调用 requireAdmin(`)
      continue
    }
    for (const { marker, index } of queryIndexes) {
      if (authIndex > index) violations.push(`${name} 在 ${marker} 之后才调用 requireAdmin(`)
    }
  }

  assert.deepEqual(violations, [], `以下文件未先鉴权：\n${violations.join('\n')}`)
})
