import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../database/migrations/019_product_infringement_checks.sql', import.meta.url), 'utf8').catch(() => '')
const schemaChecker = await readFile(new URL('../../tools/migrate-legacy/schema-check.mjs', import.meta.url), 'utf8')

test('产品侵权检测迁移创建独立记录表且结构校验器覆盖其表、索引和必填字段', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+`?product_infringement_checks`?/i)
  for (const column of ['id', 'brand_name', 'product_name', 'contact_name', 'contact_method', 'remark', 'created_at']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(migration, /ENGINE\s*=\s*InnoDB/i)
  assert.match(migration, /CHARSET\s*=\s*utf8mb4/i)
  assert.match(migration, /KEY\s+idx_product_infringement_checks_created\s*\(created_at,\s*id\)/i)
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|DELETE)\b/i)

  assert.match(schemaChecker, /'product_infringement_checks'/)
  assert.match(schemaChecker, /name:\s*'idx_product_infringement_checks_created',\s*table:\s*'product_infringement_checks',\s*columns:\s*\['created_at',\s*'id'\]/)
  for (const column of ['brand_name', 'product_name', 'contact_name', 'contact_method']) {
    assert.match(schemaChecker, new RegExp(`['"]${column}['"]`))
  }
})
