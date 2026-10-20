import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../database/migrations/022_wechat_album_import.sql', import.meta.url), 'utf8')
const fullSyncMigration = await readFile(new URL('../../database/migrations/024_wechat_album_deployment_full_sync.sql', import.meta.url), 'utf8')

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
