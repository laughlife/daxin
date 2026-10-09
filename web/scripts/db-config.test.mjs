import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDbConfig, assertReadOnlySql, assertParameterizedSql } from '../server/utils/db/config.ts'

test('缺少数据库环境变量时给出可读错误', () => {
  assert.throws(
    () => getDbConfig({ DB_HOST: '127.0.0.1' }),
    /DB_USER|DB_PASSWORD|DB_NAME|LEGACY_DB_NAME/
  )
})

test('旧库查询只允许 SELECT', () => {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT id FROM cases WHERE id = ?'))
  assert.throws(() => assertReadOnlySql('UPDATE cases SET title = ?'), /只允许 SELECT/)
  assert.throws(() => assertReadOnlySql('DROP TABLE cases'), /只允许 SELECT/)
})

test('带参数的目标库查询必须使用占位符', () => {
  assert.doesNotThrow(() => assertParameterizedSql('SELECT * FROM cases WHERE id = ?', [1]))
  assert.throws(() => assertParameterizedSql('SELECT * FROM cases WHERE id = 1', [1]), /参数化/)
  assert.doesNotThrow(() => assertParameterizedSql('SELECT COUNT(*) FROM cases', []))
})

test('生产配置禁止使用 root 账号', () => {
  assert.throws(
    () => getDbConfig({
      NODE_ENV: 'production',
      DB_HOST: '127.0.0.1',
      DB_USER: 'root',
      DB_PASSWORD: 'secret',
      DB_NAME: 'daxin',
      LEGACY_DB_HOST: '127.0.0.1',
      LEGACY_DB_USER: 'readonly',
      LEGACY_DB_PASSWORD: 'secret',
      LEGACY_DB_NAME: 'da',
    }),
    /root/
  )
})
