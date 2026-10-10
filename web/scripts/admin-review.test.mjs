// Task 7 验收测试：核验队列（/api/admin/review）的纯逻辑与静态守卫。
//
// 这些测试不连接数据库：只覆盖归一化、行映射、回填白名单与 SQL 拼装，
// 以及「/api/admin 下每个接口都必须先 requireAdmin」的静态检查。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import {
  REVIEW_ENTITY_TYPES,
  REVIEW_STATUSES,
  buildApplyStatements,
  mapReviewRow,
  normalizeEntityType,
  normalizeResolvableStatus,
  normalizeReviewStatus,
  resolveTargetStatement,
  validateApplyValue,
} from '../server/utils/admin/review-queries.ts'

// ---------------------------------------------------------------------------
// normalizeReviewStatus / normalizeEntityType
// ---------------------------------------------------------------------------

test('normalizeReviewStatus：接受三个合法状态', () => {
  assert.deepEqual([...REVIEW_STATUSES], ['open', 'confirmed', 'rejected'])
  for (const status of REVIEW_STATUSES) {
    assert.equal(normalizeReviewStatus(status), status)
  }
})

test('normalizeReviewStatus：缺省与空值回落为 open', () => {
  for (const input of [undefined, null, '', '   ', 0, {}, [], false]) {
    assert.equal(normalizeReviewStatus(input), 'open')
  }
})

test('normalizeReviewStatus：未知取值返回空串（由调用方当作不筛选）', () => {
  for (const input of ['pending', 'OPENED', 'confirmedxx', '全部', 'true']) {
    assert.equal(normalizeReviewStatus(input), '')
  }
})

test('normalizeReviewStatus：大小写不敏感，前后空白被忽略', () => {
  // 实现在比较前先 trim + toLowerCase，因此大小写与空白差异都不会被误判为「未知状态」。
  assert.equal(normalizeReviewStatus('Confirmed'), 'confirmed')
  assert.equal(normalizeReviewStatus('REJECTED'), 'rejected')
  assert.equal(normalizeReviewStatus('  Open  '), 'open')
  assert.equal(normalizeReviewStatus('confirmed '), 'confirmed')
  assert.equal(normalizeReviewStatus('confirm ed'), '')
})

test('normalizeEntityType：只接受契约中的六种实体，其余返回空串', () => {
  assert.deepEqual([...REVIEW_ENTITY_TYPES], ['case', 'article', 'brand', 'law_firm', 'ip_type', 'media'])
  assert.equal(normalizeEntityType('case'), 'case')
  assert.equal(normalizeEntityType('Law_Firm'), 'law_firm')
  assert.equal(normalizeEntityType('ip_type'), 'ip_type')
  assert.equal(normalizeEntityType('brand '), 'brand')
  for (const input of [undefined, null, '', 'cases', 'page', '全部']) {
    assert.equal(normalizeEntityType(input), '')
  }
})

test('normalizeResolvableStatus：只允许 confirmed / rejected', () => {
  assert.equal(normalizeResolvableStatus('confirmed'), 'confirmed')
  assert.equal(normalizeResolvableStatus('REJECTED'), 'rejected')
  for (const input of [undefined, null, '', 'open', 'done', 1]) {
    assert.equal(normalizeResolvableStatus(input), '')
  }
})

// ---------------------------------------------------------------------------
// validateApplyValue：白名单 + 取值校验
// ---------------------------------------------------------------------------

test('validateApplyValue：case + plaintiff 通过并归一化首尾空白', () => {
  const result = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: '  大信科技  ' })
  assert.deepEqual(result, { ok: true, column: 'plaintiff', value: '大信科技' })
})

test('validateApplyValue：case + filedAt 接受 YYYY-MM-DD，也接受带时间前缀并只取日期', () => {
  assert.deepEqual(
    validateApplyValue({ entityType: 'case', fieldName: 'filedAt', applyValue: '2024-02-29' }),
    { ok: true, column: 'filed_at', value: '2024-02-29' },
  )
  assert.deepEqual(
    validateApplyValue({ entityType: 'case', fieldName: 'filedAt', applyValue: '2024-03-05 10:20:30' }),
    { ok: true, column: 'filed_at', value: '2024-03-05' },
  )
})

test('validateApplyValue：case + filedAt 允许显式清空为 null', () => {
  for (const input of [null, undefined, '']) {
    assert.deepEqual(
      validateApplyValue({ entityType: 'case', fieldName: 'filedAt', applyValue: input }),
      { ok: true, column: 'filed_at', value: null },
    )
  }
})

test('validateApplyValue：拒绝不在白名单内的字段（绝不按字段名动态取列）', () => {
  const rejected = [
    { entityType: 'case', fieldName: 'caseNumber', applyValue: 'X-1' },
    { entityType: 'case', fieldName: 'court', applyValue: '某法院' },
    { entityType: 'case', fieldName: 'title', applyValue: '标题' },
    { entityType: 'article', fieldName: 'title', applyValue: '标题' },
    { entityType: 'article', fieldName: 'slug', applyValue: 'slug' },
    { entityType: 'brand', fieldName: 'name', applyValue: '品牌' },
    { entityType: 'media', fieldName: 'public_url', applyValue: 'https://x' },
    { entityType: 'plaintiff', fieldName: 'plaintiff', applyValue: 'x' },
    { entityType: 'case', fieldName: 'plaintiff; DROP TABLE cases', applyValue: 'x' },
  ]
  for (const input of rejected) {
    const result = validateApplyValue(input)
    assert.equal(result.ok, false, `${input.entityType}/${input.fieldName} 应被拒绝`)
    assert.equal(result.code, 'UNSUPPORTED_APPLY_FIELD')
    assert.ok(result.message.length > 0)
    assert.ok(!('column' in result), '被拒绝时不得返回任何列名')
  }
})

test('validateApplyValue：拒绝空或超长的 plaintiff', () => {
  const empty = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: '   ' })
  assert.equal(empty.ok, false)
  assert.equal(empty.code, 'INVALID_APPLY_VALUE')

  const tooLong = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: 'a'.repeat(256) })
  assert.equal(tooLong.ok, false)
  assert.equal(tooLong.code, 'INVALID_APPLY_VALUE')

  const atLimit = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: 'a'.repeat(255) })
  assert.equal(atLimit.ok, true)

  const notString = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: 123 })
  assert.equal(notString.ok, false)
})

test('validateApplyValue：拒绝非法立案日期（含不存在的日期与自由文本）', () => {
  for (const value of ['2024-02-30', '2023-02-29', '2024-13-01', '2024-1-1', '20240101', '昨天', 'now()', 20240101]) {
    const result = validateApplyValue({ entityType: 'case', fieldName: 'filedAt', applyValue: value })
    assert.equal(result.ok, false, `${String(value)} 应被拒绝`)
    assert.equal(result.code, 'INVALID_APPLY_VALUE')
  }
})

test('validateApplyValue：列名是固定常量，永不来自请求', () => {
  // 1) 同一对 (entityType, fieldName) 无论请求里塞什么额外键，返回的列都是固定字符串。
  const baseline = validateApplyValue({ entityType: 'case', fieldName: 'plaintiff', applyValue: '甲' })
  assert.equal(baseline.column, 'plaintiff')

  const withSneakyKeys = validateApplyValue({
    entityType: 'case',
    fieldName: 'plaintiff',
    applyValue: '甲',
    column: 'case_number',
    target: 'admin_users',
    sql: 'UPDATE cases SET case_number = ?',
  })
  assert.equal(withSneakyKeys.ok, true)
  assert.equal(withSneakyKeys.column, 'plaintiff', '列名只能来自白名单')

  // 2) 请求里的字段名带 SQL 片段时直接拒绝，不会有任何拼接路径。
  const injection = validateApplyValue({
    entityType: 'case',
    fieldName: "plaintiff`, case_number = '1",
    applyValue: 'x',
  })
  assert.equal(injection.ok, false)
  assert.equal(injection.code, 'UNSUPPORTED_APPLY_FIELD')

  // 3) buildApplyStatements 里列名同样只接受白名单取值。
  assert.throws(
    () => buildApplyStatements({ target: 'case', caseId: 1, column: 'case_number', value: '1' }),
    /仅支持 cases 表/,
  )
  assert.throws(
    () => buildApplyStatements({ target: 'cases; DROP TABLE cases', caseId: 1, column: 'plaintiff', value: '1' }),
    /仅支持 cases 表/,
  )
})

// ---------------------------------------------------------------------------
// buildApplyStatements / resolveTargetStatement
// ---------------------------------------------------------------------------

test('buildApplyStatements：值全部走参数数组，列名来自白名单常量', () => {
  const statement = buildApplyStatements({
    target: 'case',
    caseId: 42,
    column: 'filed_at',
    value: '2024-05-06',
  })
  assert.equal(statement.column, 'filed_at')
  assert.equal(statement.sql, 'UPDATE cases SET `filed_at` = ?, updated_at = NOW() WHERE id = ?')
  assert.deepEqual(statement.params, ['2024-05-06', 42])
  assert.ok(!statement.sql.includes('2024-05-06'), '值不得出现在 SQL 文本里')
})

test('buildApplyStatements：非法 caseId 抛错，不清空整表', () => {
  for (const caseId of [0, -1, 'abc', null, undefined, 1.5]) {
    assert.throws(() => buildApplyStatements({ target: 'case', caseId, column: 'plaintiff', value: 'x' }))
  }
})

test('resolveTargetStatement：case 走 case_sources，article 走 articles 旧库列', () => {
  const caseTarget = resolveTargetStatement({ entityType: 'case', legacySourceTable: 'cn_list' })
  assert.equal(caseTarget?.entity, 'case')
  assert.match(caseTarget.sql, /FROM case_sources/)
  assert.match(caseTarget.sql, /cs\.source_table = \? AND cs\.source_id = \?/)
  const articleTarget = resolveTargetStatement({ entityType: 'article', legacySourceTable: 'cn_list' })
  assert.equal(articleTarget?.entity, 'article')
  assert.match(articleTarget.sql, /FROM articles/)

  assert.equal(resolveTargetStatement({ entityType: 'brand', legacySourceTable: 'cn_list' }), null)
})

// ---------------------------------------------------------------------------
// mapReviewRow
// ---------------------------------------------------------------------------

test('mapReviewRow：NULL 的 resolved_at / resolution_note 映射为空串', () => {
  const item = mapReviewRow({
    id: 7,
    entity_type: 'case',
    legacy_source_table: 'cn_list',
    legacy_source_id: 99,
    field_name: 'plaintiff',
    candidate_value: '甲',
    normalized_value: '',
    context_snippet: '',
    confidence: '0.0000',
    status: 'open',
    resolved_at: null,
    resolution_note: null,
  })
  assert.equal(item.id, 7)
  assert.equal(item.entityType, 'case')
  assert.equal(item.legacySourceId, 99)
  assert.equal(item.resolvedAt, '')
  assert.equal(item.resolutionNote, '')
  assert.equal(item.confidence, 0)
  assert.equal(typeof item.confidence, 'number')
})

test('mapReviewRow：confidence 始终是数字', () => {
  assert.equal(typeof mapReviewRow({ confidence: '0.8500' }).confidence, 'number')
  assert.equal(mapReviewRow({ confidence: '0.8500' }).confidence, 0.85)
  assert.equal(mapReviewRow({ confidence: 0.5 }).confidence, 0.5)
  assert.equal(mapReviewRow({ confidence: null }).confidence, 0)
  assert.equal(mapReviewRow({}).confidence, 0)
})

test('mapReviewRow：空行也能安全映射，不抛异常', () => {
  const item = mapReviewRow(null)
  assert.equal(item.id, 0)
  assert.equal(item.resolvedAt, '')
  assert.equal(item.resolutionNote, '')
})

test('mapReviewRow：resolved_at 输出 YYYY-MM-DD HH:mm:ss', () => {
  const item = mapReviewRow({ resolved_at: '2026-01-02 03:04:05' })
  assert.equal(item.resolvedAt, '2026-01-02 03:04:05')

  const local = mapReviewRow({ resolved_at: new Date(2026, 0, 2, 3, 4, 5) })
  assert.equal(local.resolvedAt, '2026-01-02 03:04:05')

  assert.equal(mapReviewRow({ resolved_at: 'not-a-date' }).resolvedAt, '')
})

// ---------------------------------------------------------------------------
// 静态守卫：/api/admin 下的接口必须先 requireAdmin
// ---------------------------------------------------------------------------

/** /api/admin 下有意不使用 requireAdmin 的接口：登录前 / 退出时的身份接口。 */
const AUTH_ENDPOINT_EXCEPTIONS = new Set([
  'login.post.ts',
  'logout.post.ts',
  'me.get.ts',
])

const adminApiDir = resolve(import.meta.dirname, '../server/api/admin')

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? collectFiles(join(dir, entry.name))
    : [join(dir, entry.name)]))
  return nested.flat()
}

test('每个 /api/admin 接口文件都调用 requireAdmin(', async () => {
  const files = (await collectFiles(adminApiDir))
    .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))

  const offenders = []
  let checked = 0
  for (const file of files) {
    const name = file.split(/[\\/]/).pop()
    if (AUTH_ENDPOINT_EXCEPTIONS.has(name)) continue
    const source = await readFile(file, 'utf8')
    // 只检查真正的接口文件（含 defineEventHandler），类型/工具文件不在守卫范围。
    if (!source.includes('defineEventHandler')) continue
    checked += 1
    if (!source.includes('requireAdmin(')) offenders.push(relative(adminApiDir, file))
  }

  assert.ok(checked >= 5, `应至少检查到 5 个接口文件，实际 ${checked}`)
  assert.deepEqual(offenders, [], `以下接口未调用 requireAdmin：\n${offenders.join('\n')}`)
})

test('核验队列接口本身受权限码保护', async () => {
  const listSource = await readFile(join(adminApiDir, 'review.get.ts'), 'utf8')
  assert.match(listSource, /requireAdmin\(event, 'review:read'\)/)

  const itemSource = await readFile(join(adminApiDir, 'review', '[id].put.ts'), 'utf8')
  assert.match(itemSource, /requireAdmin\(event, 'review:write'\)/)
})
