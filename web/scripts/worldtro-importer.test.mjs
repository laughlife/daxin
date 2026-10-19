import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const importer = await readFile(new URL('../server/utils/worldtro/importer.ts', import.meta.url), 'utf8')
const scheduler = await readFile(new URL('../server/plugins/worldtro-scheduler.ts', import.meta.url), 'utf8')

test('WorldTRO import stores only listing fields and records source provenance', () => {
  assert.match(importer, /fetchListingHtml\(url, robots\)/)
  assert.match(importer, /case_ingest_sources/)
  assert.match(importer, /state_code/)
  assert.match(importer, /source_url/)
  assert.match(importer, /'open', 'draft'/)
  assert.doesNotMatch(importer, /fetchWorldTroDetail|fetchDetailPage|case-detail/i)
})

test('old cases, relations, brands and firms are cleared only from the initial full-import transaction', () => {
  assert.match(importer, /if \(initialImport\) await replaceOldCasesAndEntities\(connection\)/)
  assert.match(importer, /await crawlWorldTroList\([\s\S]*?initialImport,/)
  assert.match(importer, /return withTargetTransaction\(async \(connection\) => \{/)
  assert.match(importer, /if \(initialImport\) await replaceOldCasesAndEntities\(connection\)/)
  assert.match(importer, /DELETE FROM cases/)
  assert.match(importer, /DELETE FROM brands/)
  assert.match(importer, /DELETE FROM law_firms/)
})

test('daily scheduler runs after 12:00 China time only in production and can be disabled', () => {
  assert.match(scheduler, /millisecondsUntilFirstWorldTroRun\(\)/)
  assert.match(scheduler, /millisecondsUntilNextWorldTroRun\(\)/)
  assert.match(scheduler, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(scheduler, /NUXT_WORLDTRO_IMPORT_ENABLED === 'false'/)
})
