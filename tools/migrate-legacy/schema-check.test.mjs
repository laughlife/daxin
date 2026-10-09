// Task 2 验收测试：新库 DDL 必须可重复执行，并且提供页面查询所需的表、唯一键和索引。
//
// 默认只做静态检查（不需要数据库）；设置 DAXIN_SCHEMA_CHECK_DB=1 后，
// 还会连接真实 MySQL 核对 information_schema 中的表、列、唯一键和索引。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EXPECTED_INDEXES,
  EXPECTED_TABLES,
  REPO_ROOT,
  REQUIRED_UNIQUE_CONSTRAINTS,
  LIVE_CHECK_ENV,
  applyMigrations,
  createTestDatabase,
  dropTestDatabase,
  isTestDatabaseName,
  loadMigrationFiles,
  readDatabaseSchema,
  runSchemaCheck,
  splitConditionalIndexBlocks,
  stripSqlComments,
  verifyLiveSchema,
  resolveMysqlConnection,
} from './schema-check.mjs'

async function makeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'daxin-schema-'))
  const dir = join(root, 'database', 'migrations')
  await mkdir(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8')
  }
  return { root, dir, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('真实迁移目录存在且编号连续', async () => {
  const files = await loadMigrationFiles()
  assert.ok(files.length >= 2, `期望至少 2 个迁移文件，实际 ${files.length}`)
  assert.deepEqual(
    files.map((file) => file.name),
    ['001_initial_schema.sql', '002_indexes_and_constraints.sql'],
  )
  for (const file of files) {
    assert.ok(file.content.trim().length > 0, `${file.name} 内容为空`)
  }
})

test('事务安全：迁移文件不包含隐式提交语句', async () => {
  const files = await loadMigrationFiles()
  for (const file of files) {
    assert.ok(!/^\s*(DROP|TRUNCATE)\b/im.test(file.content), `${file.name} 不得出现 DROP/TRUNCATE`)
  }
})

test('静态校验失败：缺少必需表清单时报告具体缺表', async () => {
  const fixture = await makeFixture({
    '001_initial_schema.sql': 'CREATE TABLE IF NOT EXISTS site_settings (id BIGINT UNSIGNED NOT NULL PRIMARY KEY);',
    '002_indexes_and_constraints.sql': 'CREATE INDEX idx_articles_published ON articles (published_at);',
  })
  try {
    const result = await runSchemaCheck({ root: fixture.root })
    assert.equal(result.ok, false)
    assert.ok(result.missingTables.includes('articles'), '应报告缺少 articles 表')
    assert.ok(result.missingTables.includes('cases'), '应报告缺少 cases 表')
  } finally {
    await fixture.cleanup()
  }
})

test('静态校验失败：缺少唯一键和查询索引时报告具体名称', async () => {
  const tables = EXPECTED_TABLES.map((table) => `CREATE TABLE IF NOT EXISTS ${table} (id BIGINT UNSIGNED NOT NULL PRIMARY KEY);`).join('\n')
  const fixture = await makeFixture({
    '001_initial_schema.sql': tables,
    '002_indexes_and_constraints.sql': '-- 故意不建索引',
  })
  try {
    const result = await runSchemaCheck({ root: fixture.root })
    assert.equal(result.ok, false)
    assert.ok(result.missingIndexes.includes('idx_articles_published'), '应报告缺少文章分页索引')
    assert.ok(result.missingIndexes.includes('idx_cases_filed_at'), '应报告缺少案件起诉时间索引')
    assert.ok(result.missingUniqueConstraints.length > 0, '应报告缺少唯一约束')
  } finally {
    await fixture.cleanup()
  }
})

test('静态校验失败：非 UNSIGNED BIGINT 主键或可空唯一键被拒绝', async () => {
  const fixture = await makeFixture({
    '001_initial_schema.sql': [
      'CREATE TABLE IF NOT EXISTS cases (',
      '  id INT NOT NULL PRIMARY KEY,',
      '  slug VARCHAR(191) NOT NULL,',
      '  UNIQUE KEY uk_cases_slug (slug)',
      ');',
    ].join('\n'),
    '002_indexes_and_constraints.sql': 'CREATE INDEX idx_cases_filed_at ON cases (filed_at);',
  })
  try {
    const result = await runSchemaCheck({ root: fixture.root })
    assert.equal(result.ok, false)
    assert.ok(
      result.issues.some((issue) => issue.includes('cases.id')),
      `应说明 cases.id 主键不符合 BIGINT UNSIGNED：${result.issues.join('; ')}`,
    )
  } finally {
    await fixture.cleanup()
  }
})

test('静态校验通过：完整 DDL 满足表、唯一键和索引要求', async () => {
  const result = await runSchemaCheck({ root: REPO_ROOT })
  assert.deepEqual(result.missingTables, [], `缺少表：${result.missingTables.join(', ')}`)
  assert.deepEqual(result.missingUniqueConstraints, [], `缺少唯一约束：${result.missingUniqueConstraints.join(', ')}`)
  assert.deepEqual(result.missingIndexes, [], `缺少索引：${result.missingIndexes.join(', ')}`)
  assert.deepEqual(result.issues, [], `DDL 问题：${result.issues.join('; ')}`)
  assert.equal(result.ok, true)
})

test('索引列顺序满足页面查询', async () => {
  const contract = Object.fromEntries(EXPECTED_INDEXES.map((index) => [index.name, index.columns]))
  const result = await runSchemaCheck({ root: REPO_ROOT })
  for (const [name, columns] of Object.entries(contract)) {
    const actual = result.indexColumns[name]
    assert.ok(actual, `索引 ${name} 未在 DDL 中定义`)
    assert.deepEqual(
      actual.slice(0, columns.length),
      columns,
      `索引 ${name} 前导列必须是 ${columns.join(', ')}，实际 ${actual.join(', ')}`,
    )
  }
})

test('唯一约束用于避免重复迁移', () => {
  const names = REQUIRED_UNIQUE_CONSTRAINTS.map((constraint) => constraint.name)
  for (const expected of [
    'uk_articles_legacy_source',
    'uk_media_assets_object_key',
    'uk_case_progress_batch_item',
    'uk_migration_review_dedupe',
  ]) {
    assert.ok(names.includes(expected), `缺少唯一约束 ${expected}`)
  }
})

test('可重复执行：DDL 使用 IF NOT EXISTS 与条件索引块', async () => {
  const files = await loadMigrationFiles()
  // 注释里也会出现 CREATE TABLE 字样，先去掉注释再做语句级判断。
  const ddl = files
    .map((file) => stripSqlComments(splitConditionalIndexBlocks(file.content).cleaned))
    .join('\n')
  const createTables = ddl.match(/\bCREATE TABLE\b/gi) ?? []
  const createTablesIfNotExists = ddl.match(/\bCREATE TABLE IF NOT EXISTS\b/gi) ?? []
  assert.ok(createTables.length > 25, `期望解析出 25 个以上建表语句，实际 ${createTables.length}`)
  assert.equal(
    createTables.length,
    createTablesIfNotExists.length,
    '所有 CREATE TABLE 都必须带 IF NOT EXISTS',
  )

  // MySQL 8.4 不支持 CREATE INDEX IF NOT EXISTS：独立索引必须包在条件块里，
  // 由执行器查 information_schema 后再决定是否执行。
  const bareIndexes = ddl.match(/\bCREATE\s+(?:UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?INDEX\b/gi) ?? []
  assert.deepEqual(bareIndexes, [], '独立 CREATE INDEX 必须放进 @if-index-missing 条件块')

  const declared = []
  for (const file of files) {
    const { conditional } = splitConditionalIndexBlocks(file.content)
    for (const block of conditional) {
      declared.push(block.indexName)
      assert.ok(
        /\bCREATE\s+(?:UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?INDEX\b/i.test(block.sql),
        `条件块 ${block.indexName} 必须包含 CREATE INDEX 语句`,
      )
      assert.ok(
        new RegExp(`\\b${block.indexName}\\b`, 'i').test(block.sql),
        `条件块声明的索引名 ${block.indexName} 必须出现在语句中`,
      )
    }
  }
  assert.equal(new Set(declared).size, declared.length, '条件索引块的索引名不得重复')
  assert.ok(declared.length >= 4, `期望至少 4 个条件索引块，实际 ${declared.length}`)
})

test('真实 DDL 可按编号顺序解析', async () => {
  const result = await runSchemaCheck({ root: REPO_ROOT })
  assert.deepEqual(result.parseErrors, [], `DDL 解析失败：${result.parseErrors.join('; ')}`)
  assert.equal(result.statementCount > 25, true, `期望超过 25 条语句，实际 ${result.statementCount}`)
})

test('目标库连接配置可解析，并在可用时核对真实结构', async (t) => {
  const connection = resolveMysqlConnection({ repoRoot: REPO_ROOT, env: process.env })
  if (process.env[LIVE_CHECK_ENV] !== '1') {
    t.diagnostic('未设置 DAXIN_SCHEMA_CHECK_DB=1，跳过真实数据库结构核对')
    return
  }
  assert.ok(connection, '需要设置 DAXIN_SCHEMA_CHECK_DB=1，并提供 web/.env 或 mysql 登录配置')
  const database = process.env.DAXIN_TARGET_DATABASE || connection.database
  const live = await verifyLiveSchema(connection, { database })
  assert.deepEqual(live.missingTables, [], `数据库 ${database} 缺少表：${live.missingTables.join(', ')}`)
  assert.deepEqual(live.missingIndexes, [], `数据库 ${database} 缺少索引：${live.missingIndexes.join(', ')}`)
  assert.deepEqual(live.primaryKeyIssues, [], `主键类型不符合要求：${live.primaryKeyIssues.join(', ')}`)
})

// 真实库往返测试：在隔离测试库执行 DDL 两次，第二次必须全部跳过且结构不变。
// 由 DAXIN_SCHEMA_CHECK_DB=1 开启；使用完即删除该测试库。
test('迁移可重复执行：在隔离库连续执行两次结果一致', { timeout: 240000 }, async (t) => {
  const connection = resolveMysqlConnection({ repoRoot: REPO_ROOT, env: process.env })
  if (process.env[LIVE_CHECK_ENV] !== '1') {
    t.diagnostic('未设置 DAXIN_SCHEMA_CHECK_DB=1，跳过迁移往返测试')
    return
  }
  assert.ok(connection, '需要提供 web/.env 或 mysql 登录配置')

  const database = process.env.DAXIN_TEST_DATABASE || 'daxin_schema_check_dev'
  assert.ok(isTestDatabaseName(database), `测试库名必须以 _dev 或 _test 结尾：${database}`)

  try {
    await dropTestDatabase(connection, database)
    await createTestDatabase(connection, database)

    const first = await applyMigrations(connection, { database })
    assert.deepEqual(first.applied, ['001_initial_schema', '002_indexes_and_constraints'], '首次执行应应用全部迁移')

    const firstSchema = await readDatabaseSchema(connection, database)
    assert.ok(firstSchema.tableNames.includes('articles'), '首次执行后应存在 articles 表')
    assert.ok(firstSchema.tableNames.includes('schema_migrations'), '应建立迁移台账表')

    const second = await applyMigrations(connection, { database })
    assert.deepEqual(second.applied, [], '第二次执行不应重复应用任何迁移')
    assert.deepEqual(
      second.skipped.map((item) => item.version),
      ['001_initial_schema', '002_indexes_and_constraints'],
      '第二次执行应全部跳过',
    )
    assert.ok(second.skipped.every((item) => item.checksumMatches), '已应用版本的校验和必须与文件一致')

    const secondSchema = await readDatabaseSchema(connection, database)
    assert.deepEqual(
      secondSchema.tableNames.sort(),
      firstSchema.tableNames.sort(),
      '重复执行不应改变表清单',
    )
    assert.deepEqual(
      secondSchema.indexNames.sort(),
      firstSchema.indexNames.sort(),
      '重复执行不应改变索引清单',
    )

    const live = await verifyLiveSchema(connection, { database })
    assert.deepEqual(live.missingTables, [], `测试库缺少表：${live.missingTables.join(', ')}`)
    assert.deepEqual(live.missingIndexes, [], `测试库缺少索引：${live.missingIndexes.join(', ')}`)
    assert.deepEqual(live.primaryKeyIssues, [], `测试库主键类型问题：${live.primaryKeyIssues.join(', ')}`)
  } finally {
    await dropTestDatabase(connection, database)
  }
})
