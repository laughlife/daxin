// Task 7 后台配置接口的纯逻辑验收测试（不连接数据库）。
//
// 覆盖：
//   - kind 白名单与归一化（含大小写处理）；
//   - site_settings 行映射（value 原样返回、valueType 单独给出、mediaUrl 联表字段）；
//   - 分页夹取复用 public/query.ts 的共享实现；
//   - 站点配置 upsert 构造：已有当前行 → 就地 UPDATE（version+1），无当前行 → INSERT，
//     同一 key 绝不产生两条语句；
//   - 审计快照脱敏（不泄漏 password/token 之类的字段）；
//   - 静态守卫：web/server/api/admin/** 下每个接口文件都必须调用 requireAdmin。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { test } from 'node:test'

import { normalizePage, normalizePageSize, resolvePageWindow } from '../server/utils/public/query.ts'
import {
  KIND_INVALID_MESSAGE,
  SETTINGS_KINDS,
  buildConfigUpsertStatements,
  buildSettingUpsertStatements,
  mapSettingRow,
  normalizeSettingsKind,
  normalizeSettingsPayload,
  toAuditSnapshot,
} from '../server/utils/admin/settings-queries.ts'

const ADMIN_API_DIR = fileURLToPath(new URL('../server/api/admin/', import.meta.url))
const ADMIN_SETTINGS_PAGE = fileURLToPath(new URL('../app/pages/admin/settings.vue', import.meta.url))
const JSON_IMAGE_FIELD = fileURLToPath(new URL('../app/components/admin/JsonImageField.vue', import.meta.url))

/** 统计 SQL 里的占位符个数，用于断言参数与问号一一对应。 */
function placeholderCount(sql) {
  return (sql.match(/\?/g) || []).length
}

test('normalizeSettingsKind：只接受契约里的 8 个 kind，大小写与空白不敏感', () => {
  assert.deepEqual(
    [...SETTINGS_KINDS],
    ['site', 'home', 'about', 'seo', 'services', 'footer', 'contact', 'qr'],
  )

  for (const kind of SETTINGS_KINDS) {
    assert.equal(normalizeSettingsKind(kind), kind, kind)
  }

  // 大小写处理：转小写后比对，'SERVICES' / ' Services ' 都归一化为 'services'。
  // 宽松归一化与 public/query.ts 的 normalizeCaseType 一致，白名单之外仍然被拒绝。
  assert.equal(normalizeSettingsKind('SERVICES'), 'services')
  assert.equal(normalizeSettingsKind('QR'), 'qr')
  assert.equal(normalizeSettingsKind('  Site  '), 'site')

  for (const rejected of ['', '   ', 'articles', 'cases', 'settings', 'service', 'site_settings', 'site;drop table']) {
    assert.equal(normalizeSettingsKind(rejected), '', JSON.stringify(rejected))
  }
  for (const rejected of [null, undefined, 0, 1, true, {}, []]) {
    assert.equal(normalizeSettingsKind(rejected), '', String(rejected))
  }
  // h3 的 query 可能给出数组：取第一个字符串
  assert.equal(normalizeSettingsKind(['footer', 'qr']), 'footer')

  // 提示里必须列出全部允许值
  for (const kind of SETTINGS_KINDS) assert.ok(KIND_INVALID_MESSAGE.includes(kind))
})

test('mapSettingRow：value 原样返回存储字符串（不解析 JSON），valueType / mediaUrl 单独给出', () => {
  const jsonRow = mapSettingRow({
    setting_key: 'home_stats',
    setting_value: '[{"value":"7 年","label":"行业深耕"}]',
    value_type: 'json',
    media_id: null,
    status: 'published',
  })
  assert.deepEqual(jsonRow, {
    key: 'home_stats',
    value: '[{"value":"7 年","label":"行业深耕"}]',
    valueType: 'json',
    mediaId: null,
    mediaUrl: '',
    status: 'published',
  })
  // 原样返回字符串：写回时不会二次编码，展示层按 valueType 自行解析
  assert.equal(typeof jsonRow.value, 'string')
  assert.deepEqual(JSON.parse(jsonRow.value), [{ value: '7 年', label: '行业深耕' }])

  // 图片类配置：mediaId / mediaUrl 由联表得到，value 仍保留库中原文
  assert.deepEqual(
    mapSettingRow({
      setting_key: 'site_logo',
      setting_value: '',
      value_type: 'image',
      media_id: '7',
      media_url: 'https://cdn.example.com/logo.png',
      status: 'published',
    }),
    {
      key: 'site_logo',
      value: '',
      valueType: 'image',
      mediaId: 7,
      mediaUrl: 'https://cdn.example.com/logo.png',
      status: 'published',
    },
  )

  // NULL 值归一化为空串；未知 value_type 原样保留（便于发现脏数据），未知 status 回落 published
  const fallback = mapSettingRow({ setting_key: 'x', setting_value: null, value_type: 'url', status: 'weird' })
  assert.deepEqual(fallback, { key: 'x', value: '', valueType: 'url', mediaId: null, mediaUrl: '', status: 'published' })
  assert.equal(mapSettingRow({}).valueType, 'text')
})

test('分页夹取复用共享实现：page=0→1、pageSize=999→48、越界页与空结果都有稳定窗口', () => {
  assert.equal(normalizePage(0), 1)
  assert.equal(normalizePage(-5), 1)
  assert.equal(normalizePage('abc'), 1)
  assert.equal(normalizePageSize(999), 48)
  assert.equal(normalizePageSize(0), 1)
  assert.equal(normalizePageSize(48), 48)

  // total = 0：稳定的第 1 页，offset 0，不越界
  assert.deepEqual(resolvePageWindow(0, 9, 20), {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    offset: 0,
    beyondLastPage: false,
  })

  // 越界页：夹到最后一页并返回空数据（beyondLastPage=true），不会出现 page > totalPages
  const over = resolvePageWindow(3684, 999, 20)
  assert.equal(over.page, 185)
  assert.equal(over.totalPages, 185)
  assert.equal(over.beyondLastPage, true)
  assert.equal(over.offset, 184 * 20)

  // 后台默认 pageSize 20：未指定时窗口里的 pageSize 就是 20
  assert.equal(resolvePageWindow(100, 1, 20).pageSize, 20)
})

test('buildSettingUpsertStatements：已有当前行就地 UPDATE，无当前行 INSERT，同 key 只有一条语句', () => {
  const items = [
    { key: 'site_name', value: '大信法务', valueType: 'text', mediaId: null, status: 'published' },
    { key: 'site_logo', value: '', valueType: 'image', mediaId: 7, status: 'published' },
  ]

  // 两个 key 都已有 is_current=1 的行 → 两条 UPDATE，version 就地加一
  const updates = buildSettingUpsertStatements(items, {
    group: 'general',
    userId: 3,
    existingKeys: new Set(['site_name', 'site_logo']),
  })
  assert.equal(updates.length, 2)
  for (const statement of updates) {
    assert.match(statement.sql, /^UPDATE site_settings/)
    assert.match(statement.sql, /WHERE setting_key = \? AND is_current = 1/)
    assert.match(statement.sql, /ORDER BY version DESC, id ASC/)
    assert.match(statement.sql, /LIMIT 1/)
    assert.match(statement.sql, /version = version \+ 1/)
    // 绝不使用 ON DUPLICATE KEY：唯一键是 (setting_key, version)，会插入第二行
    assert.ok(!/ON DUPLICATE KEY/i.test(statement.sql))
    assert.equal(placeholderCount(statement.sql), statement.params.length)
  }
  assert.deepEqual(updates[0].params, ['general', '大信法务', 'text', null, 'published', 3, 'site_name'])
  assert.deepEqual(updates[1].params, ['general', '', 'image', 7, 'published', 3, 'site_logo'])

  // 没有当前行 → INSERT，version 取该 key 现有最大 version + 1（避开历史行的唯一键）
  const inserts = buildSettingUpsertStatements([items[0]], {
    group: 'general',
    userId: 3,
    existingKeys: new Set(),
    versionHints: new Map([['site_name', 2]]),
  })
  assert.equal(inserts.length, 1)
  assert.match(inserts[0].sql, /^INSERT INTO site_settings/)
  assert.ok(!/ON DUPLICATE KEY/i.test(inserts[0].sql))
  assert.equal(placeholderCount(inserts[0].sql), inserts[0].params.length)
  assert.deepEqual(inserts[0].params, ['site_name', 'general', '大信法务', 'text', null, 3, 'published', 3])

  // 混用：一个已有、一个没有 → 一条 UPDATE + 一条 INSERT
  const mixed = buildSettingUpsertStatements(items, {
    group: 'general',
    userId: null,
    existingKeys: ['site_name'],
    versionHints: new Map([['site_logo', 1]]),
  })
  assert.equal(mixed.length, 2)
  assert.match(mixed[0].sql, /^UPDATE site_settings/)
  assert.match(mixed[1].sql, /^INSERT INTO site_settings/)
  assert.equal(mixed[1].params[5], 2)

  // 同一次提交里的重复 key：只生成一条语句（以最后提交的值为准）
  const duplicated = buildSettingUpsertStatements([
    { key: 'site_name', value: '旧值', valueType: 'text', mediaId: null, status: 'published' },
    { key: 'site_name', value: '新值', valueType: 'text', mediaId: null, status: 'draft' },
  ], { group: 'general', existingKeys: ['site_name'] })
  assert.equal(duplicated.length, 1)

  // 任何请求值都只出现在参数里，不进入 SQL 文本
  const evil = buildSettingUpsertStatements([
    { key: "a'; DROP TABLE site_settings; --", value: 'x', valueType: 'text', mediaId: null, status: 'published' },
  ], { group: 'general' })
  assert.ok(!evil[0].sql.includes('DROP TABLE'))
  assert.equal(evil[0].params[0], "a'; DROP TABLE site_settings; --")
})

test('normalizeSettingsPayload：非法 kind 数据一律 ok=false 并给出中文提示', () => {
  const site = normalizeSettingsPayload('site', [{ key: 'site_name', value: '大信法务' }])
  assert.equal(site.ok, true)
  assert.deepEqual(site.items, [
    { key: 'site_name', value: '大信法务', valueType: 'text', mediaId: null, status: 'published' },
  ])

  // 对象/数组值按 JSON 字符串保存
  const json = normalizeSettingsPayload('home', [{ key: 'home_stats', value: [{ a: 1 }], valueType: 'json' }])
  assert.equal(json.ok, true)
  assert.equal(json.items[0].value, '[{"a":1}]')
  assert.equal(json.items[0].valueType, 'json')

  for (const [kind, raw] of [
    ['site', []],
    ['site', null],
    ['site', 'not-an-array'],
    ['site', [1, 2]],
    ['site', [{ value: '缺少 key' }]],
    ['services', [{ title: '既无 id 也无 slug' }]],
    ['services', [{ slug: 'tro', items: [{ title: '子项无 id/slug' }] }]],
    ['footer', [{ title: '缺少 itemKey' }]],
    ['contact', [{}]],
    ['qr', [null]],
  ]) {
    const result = normalizeSettingsPayload(kind, raw)
    assert.equal(result.ok, false, `${kind} ${JSON.stringify(raw)}`)
    assert.match(result.message, /[\u4e00-\u9fa5]/, '提示必须是中文')
  }

  // services：板块与子项都归一化，showDetailLink 缺省为 0
  const services = normalizeSettingsPayload('services', [
    { id: 4, slug: 'overseas-tro', title: 'TRO 全流程处理', imageMediaId: '12', showDetailLink: true, items: [{ id: 9, slug: 'tro-settle', title: 'TRO 和解' }] },
  ])
  assert.equal(services.ok, true)
  assert.equal(services.items[0].showDetailLink, 1)
  assert.equal(services.items[0].status, 1)
  assert.equal(services.items[0].imageMediaId, 12)
  assert.equal(services.items[0].items[0].id, 9)
})

test('buildConfigUpsertStatements：footer/contact/qr 按 item_key，services 按 id 或 slug 关联子项', () => {
  const footer = buildConfigUpsertStatements({
    kind: 'footer',
    items: [
      { id: 0, itemKey: 'footer-service-1', title: 'TRO应诉和解', linkPath: '', sortOrder: 10, status: 1, kind: 'service' },
      { id: 2, itemKey: 'footer-link-cases', title: 'TRO 案件查询', linkPath: '/tro/cases', sortOrder: 10, status: 1, kind: 'link' },
    ],
  })
  assert.equal(footer.length, 2)
  assert.match(footer[0].sql, /^INSERT INTO footer_services/)
  assert.match(footer[1].sql, /^INSERT INTO footer_links/)
  for (const statement of footer) {
    assert.match(statement.sql, /ON DUPLICATE KEY UPDATE/)
    assert.equal(placeholderCount(statement.sql), statement.params.length)
    assert.ok(!statement.sql.includes('TRO应诉和解'))
  }

  const contact = buildConfigUpsertStatements({
    kind: 'contact',
    items: [{ id: 0, itemKey: 'contact-phone', channelType: 'phone', label: '联系电话', value: '15918796817', sortOrder: 10, status: 1 }],
  })
  assert.match(contact[0].sql, /^INSERT INTO contact_channels/)
  assert.deepEqual(contact[0].params, ['contact-phone', 'phone', '联系电话', '15918796817', 10, 1])

  const qr = buildConfigUpsertStatements({
    kind: 'qr',
    items: [{ id: 0, itemKey: 'qr-tro-consult', title: 'TRO 咨询号二维码', mediaId: 12, caption: 'TRO 咨询', sortOrder: 10, status: 1 }],
  })
  assert.match(qr[0].sql, /^INSERT INTO qr_assets/)
  assert.equal(qr[0].params[2], 12)

  // 已有板块（带 id）→ 按 id 更新；子项顺带用 ? 绑定板块 id
  const existingSection = buildConfigUpsertStatements({
    kind: 'services',
    items: [{
      id: 4,
      slug: 'overseas-tro',
      title: 'TRO 全流程处理',
      subtitle: '',
      summary: '',
      imageMediaId: 12,
      iconKey: 'scale',
      linkPath: '/tro/success-cases',
      showDetailLink: 1,
      sortOrder: 10,
      status: 1,
      items: [{ id: 9, slug: 'overseas-tro-settle', title: 'TRO 和解', summary: '', iconKey: '', linkPath: '', sortOrder: 10, status: 1 }],
    }],
  })
  assert.equal(existingSection.length, 2)
  assert.match(existingSection[0].sql, /^UPDATE service_sections/)
  assert.match(existingSection[0].sql, /WHERE id = \?$/)
  assert.match(existingSection[1].sql, /^UPDATE service_items/)
  assert.match(existingSection[1].sql, /section_id = \?/)
  assert.deepEqual(existingSection[1].params.slice(0, 2), [4, 'overseas-tro-settle'])

  // 新板块（无 id）→ 按 slug upsert；子项用子查询关联板块 id
  const newSection = buildConfigUpsertStatements({
    kind: 'services',
    items: [{
      id: 0,
      slug: 'overseas-tro',
      title: 'TRO 全流程处理',
      subtitle: '副标题',
      summary: '',
      imageMediaId: null,
      iconKey: 'scale',
      linkPath: '/tro/success-cases',
      showDetailLink: 1,
      sortOrder: 10,
      status: 1,
      items: [{ id: 0, slug: 'overseas-tro-settle', title: 'TRO 和解', summary: '', iconKey: '', linkPath: '', sortOrder: 10, status: 1 }],
    }],
  })
  assert.match(newSection[0].sql, /^INSERT INTO service_sections/)
  assert.match(newSection[1].sql, /VALUES \(\(SELECT id FROM service_sections WHERE slug = \?\)/)
  assert.ok(!newSection[1].sql.includes('%SECTION_ID%'), '占位片段必须全部替换')
  assert.equal(newSection[1].params[0], 'overseas-tro')
  for (const statement of [...existingSection, ...newSection]) {
    assert.equal(placeholderCount(statement.sql), statement.params.length)
  }
})

test('toAuditSnapshot：脱敏后不出现 password/token 之类的字段，长文本截断', () => {
  const snapshot = toAuditSnapshot({
    kind: 'site',
    items: [
      { key: 'site_name', value: '大信法务', password: 'p@ssw0rd', accessToken: 'abc' },
      { key: 'site_logo', value: '', apiKey: 'k', nested: { secret: 's', keep: 1 } },
    ],
    authorization: 'Bearer x',
    note: 'a'.repeat(500),
  })

  const serialized = JSON.stringify(snapshot)
  for (const secret of ['password', 'p@ssw0rd', 'accessToken', 'abc', 'apiKey', 'secret', 'authorization']) {
    assert.ok(!serialized.includes(secret), `审计快照泄漏了 ${secret}`)
  }
  // 正常字段保留，长文本截断到 240 字符 + 省略号
  assert.equal(snapshot.kind, 'site')
  assert.equal(snapshot.items[0].key, 'site_name')
  assert.equal(snapshot.items[0].value, '大信法务')
  assert.equal(snapshot.items[1].nested, '[对象]')
  assert.ok(snapshot.note.length < 500)
  assert.ok(snapshot.note.endsWith('…'))
  // 层级过深时降级为占位符，不会无限递归
  assert.equal(toAuditSnapshot({ a: { b: { c: { d: 1 } } } }).a.b.c, '[对象]')
})

test('静态守卫：web/server/api/admin/** 的每个接口文件都必须调用 requireAdmin', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) files.push(full)
    }
  }
  walk(ADMIN_API_DIR)

  assert.ok(files.length >= 5, `后台接口文件数量异常：${files.length}`)
  // login / logout 是会话入口本身：登录时还没有登录态可校验，登出必须在无 Session 时
  // 也能安全返回（只清 Cookie），两者都由 session-store 直接处理会话，天然不含鉴权调用。
  // 其余文件必须显式鉴权——要么 requireAdmin(...)（抛 401/403），
  // 要么 resolveAdminSession(...)（me 这类接口需要自己决定未登录时的响应）。
  const AUTH_ENTRY_FILES = new Set(['login.post.ts', 'logout.post.ts'])
  for (const file of files) {
    const relative = path.relative(ADMIN_API_DIR, file)
    if (AUTH_ENTRY_FILES.has(relative)) continue
    const source = readFileSync(file, 'utf8')
    assert.ok(
      source.includes('requireAdmin(') || source.includes('resolveAdminSession('),
      `${relative} 缺少 requireAdmin / resolveAdminSession 鉴权`,
    )
  }

  // 本任务负责的文件额外要求「handler 内先鉴权再碰数据库」：
  // 只看 defineEventHandler 之后的代码，避免把文件顶部的查询辅助函数误判为漏鉴权。
  // 并行任务的文件只做上面的包含性断言，避免误伤他人实现风格。
  const owned = [
    'media.get.ts',
    path.join('media', '[id].delete.ts'),
    'media.post.ts',
    'settings.get.ts',
    'settings.put.ts',
  ]
  const dbEntry = /queryTarget[<(]|withTargetTransaction\(|getTargetPool\(/
  for (const relative of owned) {
    const source = readFileSync(path.join(ADMIN_API_DIR, relative), 'utf8')
    const handlerIndex = source.indexOf('defineEventHandler(')
    assert.ok(handlerIndex >= 0, `${relative} 不是 defineEventHandler 接口文件`)
    const handler = source.slice(handlerIndex)
    const guardIndex = handler.indexOf('requireAdmin(')
    const callIndex = handler.search(dbEntry)
    assert.ok(guardIndex >= 0, `${relative} 的 handler 里没有 requireAdmin 校验`)
    if (callIndex >= 0) {
      assert.ok(guardIndex < callIndex, `${relative} 在访问数据库之前没有先鉴权`)
    }
  }
})

test('站点设置页把 content_sidebar 与 home_legal_guides 接入结构化 JSON 状态与保存', () => {
  const source = readFileSync(ADMIN_SETTINGS_PAGE, 'utf8')

  for (const key of ['content_sidebar', 'home_legal_guides']) {
    assert.ok(source.includes(`item.key === '${key}'`), `${key} 有专用编辑器`)
    assert.ok(source.includes(`JSON.stringify(${key === 'content_sidebar' ? 'contentSidebar' : 'legalGuides'}.value)`), `${key} 进入 JSON 快照/保存`)
    assert.ok(source.includes(`'${key}'`), `${key} 被结构化解析并纳入错误保护`)
  }
  assert.match(source, /function parseContentSidebar/)
  assert.match(source, /function parseLegalGuides/)
  assert.match(source, /kind === 'site' && item\.key === 'content_sidebar'/)
  assert.match(source, /kind === 'home' && item\.key === 'home_legal_guides'/)
  assert.match(source, /uploadingKeys\.value\.length === 0/)
  assert.match(source, /home_legal_guides:[^`]*uploading|onImageUploading\(/)
})

test('站点配置不显示内部状态和类型说明，但保存时保留原状态', () => {
  const source = readFileSync(ADMIN_SETTINGS_PAGE, 'utf8')

  assert.doesNotMatch(source, /<label[^>]*>状态<\/label>/)
  assert.doesNotMatch(source, /v-model="item\.status"/)
  assert.match(source, /status:\s*item\.status/)
  assert.doesNotMatch(source, /SETTING_DESCRIPTIONS|settingDescription\(/)
  assert.doesNotMatch(source, /valueTypeLabel\(/)
  assert.match(source, /label: '站点信息'/)
  assert.match(source, /label: '首页内容'/)
  assert.match(source, /label: '关于我们'/)
  assert.match(source, /label: '二维码管理'/)
})

test('JSON 配置图片控件上传后返回图片 URL 并在上传期间发出禁用状态', () => {
  const source = readFileSync(JSON_IMAGE_FIELD, 'utf8')
  assert.match(source, /useOssUpload\(/)
  assert.match(source, /update:modelValue/)
  assert.match(source, /publicUrl/)
  assert.match(source, /emit\('uploading', true\)/)
  assert.match(source, /emit\('uploading', false\)/)
  assert.match(source, /usageScope: 'general'/)
})
