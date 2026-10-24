import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../database/migrations/022_wechat_album_import.sql', import.meta.url), 'utf8')
const fullSyncMigration = await readFile(new URL('../../database/migrations/024_wechat_album_deployment_full_sync.sql', import.meta.url), 'utf8')
const sourceMigration = await readFile(new URL('../../database/migrations/037_wechat_album_sources.sql', import.meta.url), 'utf8')

test('公众号同步迁移包含来源、文章去重映射和每日运行台账', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wechat_album_sources/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wechat_album_items/i)
  assert.match(migration, /UNIQUE KEY uk_wechat_album_items_identity \(source_id, message_id, item_index\)/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wechat_album_runs/i)
  assert.match(migration, /UNIQUE KEY uk_wechat_album_runs_day \(source_id, scheduled_date\)/i)
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE)\s+(?:TABLE|FROM)?/i)
})

test('部署后的一次性全量任务为每个来源保存完成标记', () => {
  assert.match(fullSyncMigration, /ADD COLUMN deployment_full_synced_at DATETIME NULL DEFAULT NULL/i)
})

test('迁移保存五个专辑来源，所有来源首次同步均为全量', () => {
  for (const sourceKey of ['tro-2025-album', 'tro-classic-album', 'tro-knowledge-album', 'tro-2026-album', 'labor-public-album']) {
    assert.ok(migration.includes(`'${sourceKey}'`), `缺少来源 ${sourceKey}`)
  }
  assert.match(migration, /'2026年TRO侵权案例',[\s\S]*?'tro-success',[\s\S]*?'full', 0/)
  assert.match(migration, /'劳动法公众号',[\s\S]*?'labor-case',[\s\S]*?'full'/)
  assert.match(migration, /'TRO科普',[\s\S]*?'knowledge'/)
})

test('新增 CPSC、专利预警与 TRO 热点资讯来源并保留重复应用时的同步游标', () => {
  assert.match(sourceMigration, /^-- @data-migration/m)
  assert.match(sourceMigration, /'CPSC',[\s\S]*?'cpsc-recalls',[\s\S]*?'full', 0, 1/)
  assert.match(sourceMigration, /'专利预警',[\s\S]*?'tro-alert',[\s\S]*?'full', 0, 1/)
  assert.match(sourceMigration, /'TRO热点资讯',[\s\S]*?'news',[\s\S]*?'full', 0, 1/)
  assert.match(sourceMigration, /album_id=4637464816469966849/)
  assert.match(sourceMigration, /album_id=4551966250071261186/)
  assert.match(sourceMigration, /album_id=4028684241973166092&scene=126/)
  assert.match(sourceMigration, /ON DUPLICATE KEY UPDATE[\s\S]*?enabled = 1/)
  assert.doesNotMatch(sourceMigration, /\b(?:DROP|TRUNCATE|DELETE|ALTER)\b/i)
})
