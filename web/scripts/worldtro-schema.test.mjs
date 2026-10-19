import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../database/migrations/021_worldtro_case_import.sql', import.meta.url), 'utf8')

test('WorldTRO migration adds jurisdiction and source/run audit tables without destructive statements', () => {
  assert.match(migration, /ADD COLUMN state_code VARCHAR\(8\)/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS case_ingest_sources/i)
  assert.match(migration, /UNIQUE KEY uk_case_ingest_source_external \(source_key, external_key\)/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS case_ingest_runs/i)
  assert.match(migration, /UNIQUE KEY uk_case_ingest_run_day \(source_key, scheduled_date\)/i)
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\s+(?:TABLE|FROM|cases)\b/i)
})
