// 新库 DDL 解析与结构校验。
//
// 静态检查不需要数据库：读取 database/migrations/*.sql，解析出表、列、唯一键和索引，
// 再核对必需表、唯一约束和页面查询索引是否存在、主键是否为 BIGINT UNSIGNED。
//
// 真实结构核对可选开启（DAXIN_SCHEMA_CHECK_DB=1）：用本机 mysql 客户端只读查询
// information_schema，不需要向 web 项目安装任何新增依赖。
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..')
export const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')
export const LIVE_CHECK_ENV = 'DAXIN_SCHEMA_CHECK_DB'

/** spec 要求的全部业务表。 */
export const REQUIRED_TABLES = Object.freeze([
  'admin_audit_logs',
  'admin_roles',
  'admin_sessions',
  'admin_user_roles',
  'admin_users',
  'article_categories',
  'article_images',
  'articles',
  'brands',
  'case_brands',
  'case_ip_types',
  'case_law_firms',
  'case_progress',
  'case_related_cases',
  'case_sources',
  'cases',
  'contact_channels',
  'footer_links',
  'footer_services',
  'ip_types',
  'law_firms',
  'media_assets',
  'migration_batches',
  'migration_review_items',
  'qr_assets',
  'service_items',
  'service_sections',
  'site_settings',
])

/** 供测试与文档使用的表清单别名（001 建表 + 002 关系表）。 */
export const EXPECTED_TABLES = Object.freeze([
  ...REQUIRED_TABLES,
  'admin_login_attempts',
])

/** 必须存在的唯一约束；每条对应一种重复迁移或重复写入的防护。 */
export const REQUIRED_UNIQUE_CONSTRAINTS = Object.freeze([
  { table: 'articles', name: 'uk_articles_slug', columns: ['slug'] },
  { table: 'articles', name: 'uk_articles_legacy_source', columns: ['legacy_source_table', 'legacy_source_id'] },
  { table: 'article_categories', name: 'uk_article_categories_slug', columns: ['slug'] },
  { table: 'article_images', name: 'uk_article_images_position', columns: ['article_id', 'position'] },
  { table: 'cases', name: 'uk_cases_case_number', columns: ['case_number'] },
  { table: 'brands', name: 'uk_brands_slug', columns: ['slug'] },
  { table: 'law_firms', name: 'uk_law_firms_slug', columns: ['slug'] },
  { table: 'ip_types', name: 'uk_ip_types_slug', columns: ['slug'] },
  { table: 'case_brands', name: 'uk_case_brands', columns: ['case_id', 'brand_id'] },
  { table: 'case_law_firms', name: 'uk_case_law_firms', columns: ['case_id', 'law_firm_id'] },
  { table: 'case_ip_types', name: 'uk_case_ip_types', columns: ['case_id', 'ip_type_id'] },
  { table: 'case_related_cases', name: 'uk_case_related_cases', columns: ['case_id', 'related_case_id'] },
  { table: 'case_sources', name: 'uk_case_sources', columns: ['case_id', 'source_table', 'source_id'] },
  { table: 'case_progress', name: 'uk_case_progress_batch_item', columns: ['case_id', 'migration_item_key_safe'] },
  { table: 'media_assets', name: 'uk_media_assets_object_key', columns: ['object_key'] },
  { table: 'site_settings', name: 'uk_site_settings_key_version', columns: ['setting_key', 'version'] },
  { table: 'footer_services', name: 'uk_footer_services_key', columns: ['item_key'] },
  { table: 'footer_links', name: 'uk_footer_links_key', columns: ['item_key'] },
  { table: 'contact_channels', name: 'uk_contact_channels_key', columns: ['item_key'] },
  { table: 'qr_assets', name: 'uk_qr_assets_key', columns: ['item_key'] },
  { table: 'service_sections', name: 'uk_service_sections_slug', columns: ['slug'] },
  { table: 'service_items', name: 'uk_service_items_slug', columns: ['slug'] },
  { table: 'migration_batches', name: 'uk_migration_batches_batch', columns: ['batch_key'] },
  { table: 'migration_review_items', name: 'uk_migration_review_dedupe', columns: ['batch_id', 'entity_type', 'legacy_source_table', 'legacy_source_id'] },
  { table: 'admin_users', name: 'uk_admin_users_username', columns: ['username'] },
  { table: 'admin_sessions', name: 'uk_admin_sessions_token_hash', columns: ['token_hash'] },
  { table: 'admin_roles', name: 'uk_admin_roles_code', columns: ['code'] },
  { table: 'admin_user_roles', name: 'uk_admin_user_roles', columns: ['user_id', 'role_id'] },
])

/** 页面查询必须命中的索引：带列顺序的契约。 */
export const EXPECTED_INDEXES = Object.freeze([
  { name: 'idx_articles_published', table: 'articles', columns: ['status', 'published_at'] },
  { name: 'idx_articles_published_desc', table: 'articles', columns: ['status', 'published_at'] },
  { name: 'idx_articles_category_published', table: 'articles', columns: ['category_id', 'status', 'published_at'] },
  { name: 'idx_cases_filed_at', table: 'cases', columns: ['filed_at'] },
  { name: 'idx_cases_number', table: 'cases', columns: ['case_number'] },
  { name: 'idx_case_brands_brand', table: 'case_brands', columns: ['brand_id'] },
  { name: 'idx_case_law_firms_law_firm', table: 'case_law_firms', columns: ['law_firm_id'] },
  { name: 'idx_case_ip_types_ip_type', table: 'case_ip_types', columns: ['ip_type_id'] },
  { name: 'idx_case_progress_timeline', table: 'case_progress', columns: ['case_id', 'occurred_on'] },
  { name: 'idx_media_assets_usage', table: 'media_assets', columns: ['usage_scope', 'deleted_at'] },
  { name: 'idx_site_settings_current', table: 'site_settings', columns: ['setting_key', 'status'] },
  { name: 'idx_service_sections_order', table: 'service_sections', columns: ['status', 'sort_order'] },
  { name: 'idx_admin_sessions_user', table: 'admin_sessions', columns: ['user_id', 'expires_at'] },
  { name: 'idx_admin_audit_logs_created', table: 'admin_audit_logs', columns: ['created_at'] },
  { name: 'idx_migration_review_open', table: 'migration_review_items', columns: ['status', 'entity_type'] },
  { name: 'idx_articles_search', table: 'articles', columns: ['title', 'summary', 'content_text'] },
  { name: 'idx_cases_court', table: 'cases', columns: ['court'] },
  { name: 'idx_media_assets_legacy_lookup', table: 'media_assets', columns: ['legacy_source_table', 'legacy_source_id'] },
  { name: 'idx_migration_review_source', table: 'migration_review_items', columns: ['legacy_source_table', 'legacy_source_id'] },
])

const DECLARATION_KEYWORDS = new Set([
  'AUTO_INCREMENT', 'CHARACTER', 'CHARSET', 'CHECK', 'COLLATE', 'COMMENT', 'CONSTRAINT',
  'DEFAULT', 'GENERATED', 'INVISIBLE', 'KEY', 'NULL', 'ON', 'PRIMARY', 'REFERENCES',
  'STORED', 'UNIQUE', 'UNSIGNED', 'VIRTUAL', 'VISIBLE', 'ZEROFILL',
])
const IGNORED_STATEMENTS = /^(SET|START\s+TRANSACTION|COMMIT|BEGIN|USE|CREATE\s+DATABASE|CREATE\s+(?:OR\s+REPLACE\s+)?VIEW)\b/i

/**
 * 关联表的外键列在插入时必然提供，允许 NOT NULL 且不带默认值。
 * 其余 NOT NULL 列必须给出默认值，避免增量加列时失败。
 */
const CHILD_KEY_COLUMNS = new Set([
  'article_id', 'brand_id', 'case_id', 'ip_type_id', 'law_firm_id', 'media_id',
  'related_case_id', 'role_id', 'user_id', 'batch_id', 'section_id', 'source_id',
])

/**
 * 业务必填列：由应用层显式赋值，因此允许 NOT NULL 且不带默认值。
 * 这些列是唯一键或必填标识，给默认值反而会掩盖缺参错误。
 */
const REQUIRED_INPUT_COLUMNS = new Set([
  'setting_key', 'object_key', 'slug', 'item_key', 'username', 'password_hash',
  'token_hash', 'code', 'case_number', 'source_table', 'batch_key', 'entity_type',
  'legacy_source_table', 'legacy_source_id', 'action', 'metric_key', 'filed_at',
])

/**
 * 允许为 NULL 且参与唯一键的列。
 * migration_item_key_safe 由 COALESCE 把 NULL 归一化为空串，唯一键因此成立。
 */
const NULLABLE_UNIQUE_COLUMNS = new Set(['migration_item_key_safe'])

/** 真实结构核对的连接参数；只返回非敏感字段。 */
export function resolveMysqlConnection({ repoRoot = REPO_ROOT, env = process.env } = {}) {
  const fileValues = readEnvFile(join(repoRoot, 'web', '.env'))
  const pick = (name) => env[name] || fileValues[name] || ''
  const client = findMysqlClient()
  const password = pick('DB_PASSWORD')
  const base = {
    client,
    host: pick('DB_HOST') || '127.0.0.1',
    port: pick('DB_PORT') || '3306',
    user: pick('DB_USER'),
    database: pick('DB_NAME') || 'daxin',
    password,
    loginPath: '',
    auth: '',
  }
  // 有密码时直接用密码；没有密码时回退到 mysql_config_editor 保存的登录配置。
  if (base.user && base.password) return { ...base, auth: 'password' }
  const loginPath = findMysqlLoginPath(env)
  if (loginPath) return { ...base, user: base.user || 'root', loginPath, auth: 'login-path', password: '' }
  return null
}

/** 读取 database/migrations 下按文件名排序的迁移文件。 */
export async function loadMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(names.map(async (name) => ({
    name,
    path: join(dir, name),
    content: await readFile(join(dir, name), 'utf8'),
  })))
}

/** 去掉注释，但保留字符串字面量内容。反引号是标识符引用，不作为字符串处理。 */
export function stripSqlComments(sql) {
  let out = ''
  let index = 0
  while (index < sql.length) {
    const char = sql[index]
    if (char === "'" || char === '"') {
      const end = readQuoted(sql, index)
      out += sql.slice(index, end)
      index = end
      continue
    }
    if (char === '-' && sql[index + 1] === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1
      continue
    }
    if (char === '#') {
      while (index < sql.length && sql[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2)
      index = end === -1 ? sql.length : end + 2
      continue
    }
    out += char
    index += 1
  }
  return out
}

/** 按分号切分顶级语句，忽略字符串字面量中的分号。 */
export function splitStatements(sql) {
  const statements = []
  let current = ''
  let index = 0
  while (index < sql.length) {
    const char = sql[index]
    if (char === "'" || char === '"' || char === '`') {
      const end = readQuoted(sql, index)
      current += sql.slice(index, end)
      index = end
      continue
    }
    if (char === ';') {
      statements.push(current)
      current = ''
      index += 1
      continue
    }
    current += char
    index += 1
  }
  statements.push(current)
  return statements.map((statement) => statement.trim()).filter(Boolean)
}

/** 解析一条 CREATE TABLE 语句。 */
export function parseCreateTable(statement) {
  const match = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s*\(/i.exec(statement)
  if (!match) return null
  const table = match[1]
  const openIndex = statement.indexOf('(', match.index + 'CREATE TABLE'.length)
  const bodyEnd = findMatchingParen(statement, openIndex)
  if (bodyEnd === -1) return null
  const columns = []
  const uniqueKeys = []
  const indexes = []
  const primaryKey = []
  for (const entry of splitDefinitions(statement.slice(openIndex + 1, bodyEnd))) {
    const column = parseColumnDefinition(entry)
    if (column) {
      columns.push(column)
      if (column.primaryKey) primaryKey.push(column.name)
      continue
    }
    const constraint = parseTableConstraint(entry)
    if (!constraint) continue
    if (constraint.kind === 'primary') primaryKey.push(...constraint.columns)
    if (constraint.kind === 'unique') uniqueKeys.push(constraint)
    if (constraint.kind === 'index') indexes.push(constraint)
  }
  return { table, columns, uniqueKeys, indexes, primaryKey }
}

/** 解析一条 CREATE [UNIQUE|FULLTEXT|SPATIAL] INDEX 语句。 */
export function parseCreateIndex(statement) {
  const match = /^CREATE\s+(?:(UNIQUE|FULLTEXT|SPATIAL)\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s+ON\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]*)\)/i.exec(statement)
  if (!match) return null
  return {
    name: match[2],
    table: match[3],
    columns: match[4].split(',').map((part) => part.trim().replace(/`/g, '').split(/\s+/)[0]).filter(Boolean),
    unique: (match[1] ?? '').toUpperCase() === 'UNIQUE',
    kind: (match[1] ?? '').toLowerCase(),
  }
}

/** 解析全部迁移语句。 */
export function parseMigrations(files) {
  const tables = new Map()
  const indexes = new Map()
  const errors = []
  let statementCount = 0
  for (const file of files) {
    const { cleaned, conditional } = splitConditionalIndexBlocks(file.content)
    for (const block of conditional) {
      const index = parseCreateIndex(block.sql)
      if (!index) {
        errors.push(`${file.name} 条件索引块 ${block.indexName} 无法解析`)
        continue
      }
      if (indexes.has(index.name)) errors.push(`${file.name} 重复定义索引 ${index.name}`)
      indexes.set(index.name, index)
    }
    for (const statement of splitStatements(stripSqlComments(cleaned))) {
      if (IGNORED_STATEMENTS.test(statement)) continue
      statementCount += 1
      const table = parseCreateTable(statement)
      if (table) {
        if (tables.has(table.table)) errors.push(`${file.name} 重复定义表 ${table.table}`)
        tables.set(table.table, table)
        for (const inline of [...table.indexes, ...table.uniqueKeys]) {
          if (!inline.name) continue
          if (indexes.has(inline.name)) errors.push(`${file.name} 重复定义索引 ${inline.name}`)
          indexes.set(inline.name, { name: inline.name, table: table.table, columns: inline.columns, unique: inline.kind === 'unique' })
        }
        continue
      }
      const index = parseCreateIndex(statement)
      if (index) {
        if (indexes.has(index.name)) errors.push(`${file.name} 重复定义索引 ${index.name}`)
        indexes.set(index.name, index)
        continue
      }
      if (/^ALTER\s+TABLE/i.test(statement)) {
        for (const index of parseAlterTableIndexes(statement)) {
          if (indexes.has(index.name)) errors.push(`${file.name} 重复定义索引 ${index.name}`)
          indexes.set(index.name, index)
        }
        continue
      }
      errors.push(`${file.name} 出现未预期的语句：${statement.slice(0, 60)}…`)
    }
  }
  return { tables, indexes, errors, statementCount }
}

/** 执行静态结构校验。 */
export async function runSchemaCheck({ root = REPO_ROOT } = {}) {
  const dir = join(root, 'database', 'migrations')
  const files = await loadMigrationFiles(dir)
  const { tables, indexes, errors, statementCount } = parseMigrations(files)

  const missingTables = EXPECTED_TABLES.filter((table) => !tables.has(table))
  const availableTables = new Set(tables.keys())

  const missingUniqueConstraints = []
  for (const required of REQUIRED_UNIQUE_CONSTRAINTS) {
    const table = tables.get(required.table)
    if (!table) {
      missingUniqueConstraints.push(`${required.table}.${required.name}`)
      continue
    }
    const found = table.uniqueKeys.find((key) => key.name === required.name)
      ?? table.uniqueKeys.find((key) => sameColumns(key.columns, required.columns))
      ?? (table.primaryKey.length > 0 && required.name.startsWith('uk_') && sameColumns(table.primaryKey, required.columns) ? { name: required.name, columns: required.columns } : undefined)
    if (!found) missingUniqueConstraints.push(`${required.table}.${required.name}`)
  }

  const missingIndexes = EXPECTED_INDEXES
    .filter((index) => !indexes.has(index.name) && availableTables.has(index.table))
    .map((index) => index.name)

  const indexColumns = {}
  for (const [name, index] of indexes) indexColumns[name] = index.columns

  const issues = []
  for (const table of tables.values()) {
    if (table.primaryKey.length === 0) issues.push(`表 ${table.table} 缺少主键`)
    const seenColumns = new Set()
    for (const column of table.columns) {
      if (!column.name) {
        issues.push(`表 ${table.table} 存在无法解析的列定义`)
        continue
      }
      if (seenColumns.has(column.name)) issues.push(`表 ${table.table} 重复定义列 ${column.name}`)
      seenColumns.add(column.name)
      if (column.primaryKey && !/^bigint unsigned$/i.test(column.type)) {
        issues.push(`${table.table}.${column.name} 主键必须是 BIGINT UNSIGNED，实际 ${column.type}`)
      }
      if (column.notNull && !column.hasDefault && !column.autoIncrement && !column.primaryKey && !column.generated && !CHILD_KEY_COLUMNS.has(column.name) && !REQUIRED_INPUT_COLUMNS.has(column.name)) {
        issues.push(`${table.table}.${column.name} 为 NOT NULL 但没有默认值`)
      }
      if (column.references && !tables.has(column.references)) {
        issues.push(`${table.table}.${column.name} 引用未定义的表 ${column.references}`)
      }
    }
    if (table.columns.length === 0) issues.push(`表 ${table.table} 未解析出任何列，DDL 可能损坏`)
    for (const key of table.uniqueKeys) {
      for (const columnName of key.columns) {
        const column = table.columns.find((item) => item.name === columnName)
        if (!column) {
          issues.push(`${table.table}.${key.name} 引用了不存在的列 ${columnName}`)
          continue
        }
        if (column.nullable && !NULLABLE_UNIQUE_COLUMNS.has(columnName)) {
          issues.push(`${table.table}.${key.name} 唯一键列 ${columnName} 允许为 NULL`)
        }
      }
    }
  }

  for (const index of EXPECTED_INDEXES) {
    const actual = indexes.get(index.name)
    if (!actual || !availableTables.has(index.table)) continue
    if (actual.table !== index.table) issues.push(`索引 ${index.name} 建在 ${actual.table}，期望 ${index.table}`)
    if (!sameColumns(actual.columns.slice(0, index.columns.length), index.columns)) {
      issues.push(`索引 ${index.name} 前导列 ${actual.columns.join(', ')}，期望 ${index.columns.join(', ')}`)
    }
  }

  const ok = missingTables.length === 0
    && missingUniqueConstraints.length === 0
    && missingIndexes.length === 0
    && issues.length === 0
    && errors.length === 0

  return {
    ok,
    files: files.map((file) => file.name),
    tables: [...tables.keys()].sort(),
    missingTables,
    missingUniqueConstraints,
    missingIndexes,
    indexColumns,
    issues,
    parseErrors: errors,
    statementCount,
  }
}

/** 已应用迁移的追踪表；不属于业务表，因此不在 EXPECTED_TABLES 中。 */
export const MIGRATION_LEDGER_TABLE = 'schema_migrations'

/**
 * 条件建索引块：
 *
 *   -- @if-index-missing <索引名>
 *   CREATE INDEX ...;
 *   -- @end-if-index-missing
 *
 * MySQL 8.4 不支持 CREATE INDEX IF NOT EXISTS，也不支持 ALTER TABLE ADD INDEX
 * IF NOT EXISTS。把这类语句放进条件块后，执行器会先查 information_schema，
 * 索引已存在就跳过，因此迁移可以安全重放。
 */
const CONDITIONAL_INDEX_PATTERN = /--\s*@if-index-missing\s+([A-Za-z0-9_]+)[^\n]*\r?\n([\s\S]*?)--\s*@end-if-index-missing/g

/** 取出条件索引块，返回清理后的 SQL 与待执行的条件语句。 */
export function splitConditionalIndexBlocks(sql) {
  const conditional = []
  const cleaned = sql.replace(CONDITIONAL_INDEX_PATTERN, (_match, indexName, body) => {
    conditional.push({ indexName: indexName.trim(), sql: body.trim() })
    return ''
  })
  return { cleaned, conditional }
}

/**
 * 按文件名顺序执行迁移，并把已执行的版本写入 schema_migrations。
 * 每个文件在一条连接内执行；同一版本重复执行返回 skipped，不会重复写入台账。
 */
export async function applyMigrations(connection, { dir = MIGRATIONS_DIR, database = connection.database, force = false } = {}) {
  const files = await loadMigrationFiles(dir)
  const applied = []
  const skipped = []
  const conditionalSkipped = []
  await runMysqlWrite(connection, database, `
CREATE TABLE IF NOT EXISTS ${MIGRATION_LEDGER_TABLE} (
  version VARCHAR(64) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '已应用的 DDL 版本';
`.trim())

  const ledger = await runMysql(connection, `SELECT version, checksum FROM ${MIGRATION_LEDGER_TABLE}`, { database })
  const ledgerMap = new Map(ledger.map((row) => [row[0], row[1]]))

  for (const file of files) {
    const version = file.name.replace(/\.sql$/i, '')
    const checksum = createHash('sha256').update(file.content).digest('hex')
    if (ledgerMap.has(version) && !force) {
      skipped.push({ version, checksumMatches: ledgerMap.get(version) === checksum })
      continue
    }
    const { cleaned, conditional } = splitConditionalIndexBlocks(file.content)
    if (cleaned.trim()) {
      await runMysqlWrite(connection, database, cleaned)
    }
    for (const block of conditional) {
      const existing = await runMysql(
        connection,
        `SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ${quoteLiteral(database)} AND INDEX_NAME = ${quoteLiteral(block.indexName)}`,
        { database },
      )
      if (Number(existing[0]?.[0] ?? 0) > 0) {
        conditionalSkipped.push(block.indexName)
        continue
      }
      await runMysqlWrite(connection, database, block.sql)
    }
    await runMysqlWrite(
      connection,
      database,
      `INSERT INTO ${MIGRATION_LEDGER_TABLE} (version, checksum) VALUES (${quoteLiteral(version)}, ${quoteLiteral(checksum)})
       ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), applied_at = CURRENT_TIMESTAMP`,
      { database },
    )
    applied.push(version)
  }
  return { applied, skipped, conditionalSkipped, database }
}

/** 清理迁移测试库；只允许删除名称符合测试约定的库。 */
export async function dropTestDatabase(connection, database) {
  if (!isTestDatabaseName(database)) {
    throw new Error(`拒绝删除非测试库：${database}`)
  }
  await runMysqlWrite(connection, '', `DROP DATABASE IF EXISTS \`${database}\``)
}

/** 建立迁移测试库；只允许名称符合测试约定的库。 */
export async function createTestDatabase(connection, database) {
  if (!isTestDatabaseName(database)) {
    throw new Error(`拒绝创建非测试库：${database}`)
  }
  await runMysqlWrite(connection, '', `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
}

/** 读取指定库的表、列和索引。 */
export async function readDatabaseSchema(connection, database = connection.database) {
  const where = `TABLE_SCHEMA = ${quoteLiteral(database)}`
  const tableRows = await runMysql(connection, `SELECT TABLE_NAME FROM information_schema.TABLES WHERE ${where} AND TABLE_TYPE = 'BASE TABLE'`, { database })
  const columnRows = await runMysql(connection, `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY FROM information_schema.COLUMNS WHERE ${where}`, { database })
  const indexRows = await runMysql(connection, `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE ${where}`, { database })
  return {
    database,
    tableNames: tableRows.map((row) => row[0]).filter(Boolean),
    columns: columnRows.map((row) => ({ tableName: row[0], columnName: row[1], columnType: row[2], columnKey: row[3] })),
    indexNames: indexRows.map((row) => row[0]).filter(Boolean),
  }
}

/** 只读核对真实 MySQL 结构。 */
export async function verifyLiveSchema(connection, { tables = EXPECTED_TABLES, indexes = EXPECTED_INDEXES, database } = {}) {
  const schema = await readDatabaseSchema(connection, database ?? connection.database)
  const liveTables = new Set(schema.tableNames)
  const primaryKeyTypes = new Map(
    schema.columns
      // 台账表由执行器自建，主键只需唯一，不参与业务主键规范。
      .filter((column) => column.columnKey === 'PRI' && column.tableName !== MIGRATION_LEDGER_TABLE)
      .map((column) => [`${column.tableName}.${column.columnName}`, column.columnType]),
  )
  const primaryKeyIssues = []
  for (const [key, type] of primaryKeyTypes) {
    if (!/^bigint unsigned$/i.test(type)) primaryKeyIssues.push(`${key} 实际类型 ${type}`)
  }
  const liveIndexNames = new Set(schema.indexNames)
  return {
    database: schema.database,
    tableNames: schema.tableNames,
    indexNames: schema.indexNames,
    missingTables: tables.filter((table) => !liveTables.has(table)),
    missingIndexes: indexes.filter((index) => !liveIndexNames.has(index.name) && liveTables.has(index.table)).map((index) => index.name),
    primaryKeyIssues,
  }
}

function runMysql(connection, sql, { database, timeoutMs = 30000, stdoutLimit = 8 * 1024 * 1024 } = {}) {
  return runMysqlRaw(connection, sql, { database, timeoutMs, stdoutLimit }).then(parseTabRows)
}

function runMysqlWrite(connection, database, sql, { multiStatement = false, timeoutMs = 120000 } = {}) {
  return runMysqlRaw(connection, sql, {
    database,
    timeoutMs,
    stdoutLimit: 1024 * 1024,
    multiStatement,
  }).then(() => undefined)
}

function runMysqlRaw(connection, sql, { database, timeoutMs, stdoutLimit, multiStatement = false }) {
  const args = [
    ...(connection.loginPath ? [`--login-path=${connection.loginPath}`] : []),
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--user=${connection.user}`,
    '--connect-timeout=5',
    '--batch',
    '--skip-column-names',
    '--default-character-set=utf8mb4',
  ]
  if (database) args.push(`--database=${database}`)
  args.push(`--execute=${sql}`)
  return new Promise((resolvePromise, rejectPromise) => {
    execFileCallback(connection.client, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: stdoutLimit,
      env: connection.password ? { ...process.env, MYSQL_PWD: connection.password } : process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(`mysql 执行失败（库 ${database || '(无)'}）：${(stderr || error.message).trim().slice(0, 600)}`))
        return
      }
      const warnings = String(stderr).trim()
      if (warnings && /error/i.test(warnings)) {
        rejectPromise(new Error(`mysql 报告错误：${warnings.slice(0, 600)}`))
        return
      }
      resolvePromise(String(stdout))
    })
  })
}

function parseTabRows(stdout) {
  return stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => line.split('\t'))
}

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  let content = ''
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function findMysqlClient() {
  if (process.env.DAXIN_MYSQL_CLIENT) return process.env.DAXIN_MYSQL_CLIENT
  for (const candidate of ['C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe', '/usr/bin/mysql', '/usr/local/bin/mysql']) {
    if (existsSync(candidate)) return candidate
  }
  return 'mysql'
}

function findMysqlLoginPath(env) {
  if (env.DAXIN_MYSQL_LOGIN_PATH) return env.DAXIN_MYSQL_LOGIN_PATH
  const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const path = join(appData, 'MySQL', '.mylogin.cnf')
  return existsSync(path) ? (env.DAXIN_MYSQL_LOGIN_NAME || 'daxin') : ''
}

function parseColumnDefinition(entry) {
  // 列名后必须紧跟空白和类型；类型可以带长度，例如 VARCHAR(191)、DECIMAL(5,4)。
  const match = /^`?([A-Za-z0-9_]+)`?\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)/.exec(entry)
  if (!match) return null
  const name = match[1]
  const upper = entry.toUpperCase()
  if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|FULLTEXT|SPATIAL|CHECK)\b/.test(upper)) return null
  const typeMatch = /^`?[A-Za-z0-9_]+`?\s+(bigint|int|smallint|tinyint|mediumint|decimal|numeric|double|float|bit|varchar|char|text|tinytext|mediumtext|longtext|enum|set|date|datetime|timestamp|time|year|json|blob|tinyblob|mediumblob|longblob|binary|varbinary|geometry|point)(\s*\([^)]*\))?(\s+unsigned)?/i.exec(entry)
  const type = typeMatch
    ? `${typeMatch[1]}${typeMatch[2] ?? ''}${typeMatch[3] ? ' unsigned' : ''}`.toLowerCase()
    : match[2].trim().toLowerCase()
  return {
    name,
    type,
    notNull: /\bNOT\s+NULL\b/.test(upper),
    nullable: !/\bNOT\s+NULL\b/.test(upper),
    hasDefault: /\bDEFAULT\b/.test(upper),
    autoIncrement: /\bAUTO_INCREMENT\b/.test(upper),
    generated: /\bGENERATED\b/.test(upper),
    primaryKey: /\bPRIMARY\s+KEY\b/.test(upper),
    references: (/REFERENCES\s+`?([A-Za-z0-9_]+)`?/i.exec(entry) ?? [])[1] ?? '',
  }
}

function parseTableConstraint(entry) {
  const primary = /^PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(entry)
  if (primary) return { kind: 'primary', columns: columnList(primary[1]) }
  const unique = /^(?:CONSTRAINT\s+`?([A-Za-z0-9_]+)`?\s+)?UNIQUE\s+(?:KEY|INDEX)?\s*(?:`?([A-Za-z0-9_]+)`?\s*)?\(([^)]*)\)/i.exec(entry)
  if (unique) {
    return { kind: 'unique', name: unique[2] || unique[1] || '', columns: columnList(unique[3]) }
  }
  const index = /^(?:KEY|INDEX)\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]*)\)/i.exec(entry)
  if (index) return { kind: 'index', name: index[1], columns: columnList(index[2]) }
  return null
}

function parseAlterTableIndexes(statement) {
  const table = (/^ALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?/i.exec(statement) ?? [])[1]
  if (!table) return []
  const indexes = []
  for (const clause of statement.split(/,(?![^()]*\))/)) {
    const index = /ADD\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s*\(([^)]*)\)/i.exec(clause)
    if (index) indexes.push({ name: index[1], table, columns: columnList(index[2]), unique: /ADD\s+UNIQUE/i.test(clause) })
  }
  return indexes
}

function columnList(raw) {
  return raw.split(',').map((part) => part.trim().replace(/`/g, '').split(/\s+/)[0]).filter(Boolean)
}

function sameColumns(left, right) {
  return left.length === right.length && left.every((column, index) => column.toLowerCase() === right[index].toLowerCase())
}

function splitDefinitions(body) {
  const parts = []
  let current = ''
  let depth = 0
  let index = 0
  while (index < body.length) {
    const char = body[index]
    if (char === "'" || char === '"' || char === '`') {
      const end = readQuoted(body, index)
      current += body.slice(index, end)
      index = end
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
    index += 1
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function findMatchingParen(text, openIndex) {
  let depth = 0
  let index = openIndex
  while (index < text.length) {
    const char = text[index]
    if (char === "'" || char === '"' || char === '`') {
      index = readQuoted(text, index)
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
    index += 1
  }
  return -1
}

function readQuoted(text, start) {
  const quote = text[start]
  let index = start + 1
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2
      continue
    }
    if (text[index] === quote) {
      if (text[index + 1] === quote) {
        index += 2
        continue
      }
      return index + 1
    }
    index += 1
  }
  return text.length
}

function quoteLiteral(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

/** 只在测试库名上允许破坏性操作。 */
export function isTestDatabaseName(database) {
  return /(_dev|_test)$/.test(database) || /^daxin_schema_check/.test(database)
}

function parseCliArgs(argv) {
  const options = { apply: false, drop: false, force: false, json: false, help: false, database: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') options.apply = true
    else if (arg === '--drop') options.drop = true
    else if (arg === '--force') options.force = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--database') options.database = argv[++index] ?? ''
    else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length)
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

const USAGE = `用法：node tools/migrate-legacy/schema-check.mjs [选项]

  --database <name>  指定要核对的数据库（默认读取 web/.env 的 DB_NAME）
  --apply            执行 database/migrations/*.sql 并写入 schema_migrations 台账
  --drop             执行 --apply 前删除目标测试库（仅允许 *_dev、*_test）
  --force            忽略 schema_migrations 台账，重新执行全部迁移（DDL 必须幂等）
  --json             以 JSON 输出结果
  -h, --help         显示本帮助
`

async function main() {
  let options
  try {
    options = parseCliArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(USAGE)
    return
  }

  const report = { static: null, connection: null, applied: [], skipped: [], conditionalSkipped: [], live: null, errors: [] }
  const staticResult = await runSchemaCheck({ root: REPO_ROOT })
  report.static = {
    ok: staticResult.ok,
    files: staticResult.files,
    tables: staticResult.tables.length,
    indexes: Object.keys(staticResult.indexColumns).length,
    missingTables: staticResult.missingTables,
    missingUniqueConstraints: staticResult.missingUniqueConstraints,
    missingIndexes: staticResult.missingIndexes,
    issues: staticResult.issues,
    parseErrors: staticResult.parseErrors,
  }

  let connection = null
  if (options.apply || options.database) {
    connection = resolveMysqlConnection({ repoRoot: REPO_ROOT, env: process.env })
    if (!connection) {
      report.errors.push('无法解析 MySQL 连接：请在 web/.env 填写 DB_* 或配置 mysql 登录配置')
    }
  }
  const database = options.database || connection?.database || ''

  if (connection && options.drop && options.apply) {
    if (!isTestDatabaseName(database)) {
      report.errors.push(`拒绝删除非测试库：${database}`)
    } else {
      await dropTestDatabase(connection, database)
    }
  }

  if (connection && options.apply && report.errors.length === 0) {
    if (isTestDatabaseName(database)) {
      await createTestDatabase(connection, database)
    }
    const result = await applyMigrations(connection, { database, force: options.force })
    report.applied = result.applied
    report.skipped = result.skipped
    report.conditionalSkipped = result.conditionalSkipped
  }

  if (connection && options.database) {
    report.live = await verifyLiveSchema(connection, { database })
  }
  if (connection) {
    report.connection = { host: connection.host, port: connection.port, user: connection.user, database, auth: connection.auth }
  }

  const liveOk = !report.live
    || (report.live.missingTables.length === 0
      && report.live.missingIndexes.length === 0
      && report.live.primaryKeyIssues.length === 0)
  const ok = staticResult.ok && liveOk && report.errors.length === 0

  if (options.json) {
    console.log(JSON.stringify({ ok, ...report }, null, 2))
  } else {
    console.log(`静态校验：${staticResult.ok ? '通过' : '失败'}`)
    console.log(`  迁移文件：${staticResult.files.join(', ') || '(无)'}`)
    console.log(`  表：${staticResult.tables.length}，索引：${Object.keys(staticResult.indexColumns).length}`)
    if (staticResult.missingTables.length) console.log(`  缺少表：${staticResult.missingTables.join(', ')}`)
    if (staticResult.missingUniqueConstraints.length) console.log(`  缺少唯一约束：${staticResult.missingUniqueConstraints.join(', ')}`)
    if (staticResult.missingIndexes.length) console.log(`  缺少索引：${staticResult.missingIndexes.join(', ')}`)
    for (const issue of staticResult.issues) console.log(`  问题：${issue}`)
    for (const error of staticResult.parseErrors) console.log(`  解析错误：${error}`)
    if (report.connection) {
      console.log(`数据库 ${report.connection.database}（${report.connection.host}:${report.connection.port}，认证方式 ${report.connection.auth}）`)
    }
    if (report.applied.length) console.log(`  已执行迁移：${report.applied.join(', ')}`)
    if (report.conditionalSkipped.length) console.log(`  已存在跳过的索引：${report.conditionalSkipped.join(', ')}`)
    if (report.skipped.length) {
      const stale = report.skipped.filter((item) => !item.checksumMatches).map((item) => item.version)
      console.log(`  跳过已执行：${report.skipped.map((item) => item.version).join(', ')}`)
      if (stale.length) console.log(`  警告：以下版本内容已变化但未重新执行：${stale.join(', ')}`)
    }
    if (report.live) {
      console.log(`真实结构校验：${liveOk ? '通过' : '失败'}`)
      if (report.live.missingTables.length) console.log(`  缺少表：${report.live.missingTables.join(', ')}`)
      if (report.live.missingIndexes.length) console.log(`  缺少索引：${report.live.missingIndexes.join(', ')}`)
      if (report.live.primaryKeyIssues.length) console.log(`  主键问题：${report.live.primaryKeyIssues.join(', ')}`)
    }
    for (const error of report.errors) console.log(`错误：${error}`)
    console.log(ok ? '结果：通过' : '结果：失败')
  }
  process.exitCode = ok ? 0 : 1
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (invokedDirectly) {
  await main()
}

export { parseColumnDefinition, parseTableConstraint }
