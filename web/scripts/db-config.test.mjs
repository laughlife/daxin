import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertParameterizedSql,
  assertReadOnlySql,
  getDbConfig,
  getLegacyDbConfig,
  getTargetDbConfig,
} from '../server/utils/db/config.ts'

const targetEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'daxin_app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'daxin',
}

const legacyEnv = {
  LEGACY_DB_HOST: '127.0.0.1',
  LEGACY_DB_PORT: '3306',
  LEGACY_DB_USER: 'daxin_readonly',
  LEGACY_DB_PASSWORD: 'secret',
  LEGACY_DB_NAME: 'da',
}

test('缺少目标库环境变量时给出可读错误', () => {
  assert.throws(
    () => getTargetDbConfig({ DB_HOST: '127.0.0.1' }),
    /DB_USER|DB_PASSWORD|DB_NAME/,
  )
})

test('目标库配置不依赖旧库变量', () => {
  // 旧库只在迁移阶段使用；未配置 LEGACY_DB_* 不应影响业务库查询。
  assert.doesNotThrow(() => getTargetDbConfig(targetEnv))
  const config = getTargetDbConfig(targetEnv)
  assert.equal(config.database, 'daxin')
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.user, 'daxin_app')
})

test('旧库配置只在实际使用时校验，并给出可读错误', () => {
  assert.throws(() => getLegacyDbConfig(targetEnv), /LEGACY_DB_HOST/)
  const config = getLegacyDbConfig({ ...targetEnv, ...legacyEnv })
  assert.equal(config.database, 'da')
  assert.equal(config.user, 'daxin_readonly')
})

test('getDbConfig 允许缺少旧库变量时仍然可用', () => {
  const config = getDbConfig(targetEnv)
  assert.equal(config.targetName, 'daxin')
  assert.equal(config.legacyName, '')
  assert.throws(() => config.legacy, /LEGACY_DB_HOST/)
})

test('getDbConfig 同时提供两套配置时可直接读取', () => {
  const config = getDbConfig({ ...targetEnv, ...legacyEnv })
  assert.equal(config.targetName, 'daxin')
  assert.equal(config.legacyName, 'da')
  assert.equal(config.target.user, 'daxin_app')
  assert.equal(config.legacy.user, 'daxin_readonly')
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
    () => getTargetDbConfig({ ...targetEnv, NODE_ENV: 'production', DB_USER: 'root' }),
    /root/,
  )
  assert.throws(
    () => getLegacyDbConfig({ ...targetEnv, ...legacyEnv, NODE_ENV: 'production', LEGACY_DB_USER: 'root' }),
    /root/,
  )
  assert.doesNotThrow(() => getTargetDbConfig({ ...targetEnv, NODE_ENV: 'production' }))
})
