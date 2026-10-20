import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const importer = await readFile(new URL('../server/utils/wechat-album/importer.ts', import.meta.url), 'utf8')
const scheduler = await readFile(new URL('../server/plugins/wechat-album-scheduler.ts', import.meta.url), 'utf8')

test('article import stores list metadata, category and OSS cover without requesting or saving the body', () => {
  assert.match(importer, /INSERT INTO articles[\s\S]*?content_html, content_text, category_id, cover_media_id, published_at/)
  assert.match(importer, /VALUES \(\?, \?, NULL, NULL, NULL, \?, \?, \?, 'published'/)
  assert.match(importer, /status, is_featured, show_in_sidebar, legacy_source_table, legacy_source_id/)
  assert.doesNotMatch(importer, /parseWechatArticlePage|fetchWechatText\(identity\.url/)
  assert.match(importer, /INSERT INTO wechat_album_items[\s\S]*?source_url, title, cover_source_url, published_at/)
  assert.match(importer, /cover_media_id/)
  assert.match(importer, /WHERE slug = \? AND status = 1/)
})

test('only the cover is uploaded as verified article media; body image handling is absent', () => {
  assert.match(importer, /createPostObjectPolicy\([\s\S]*?usageScope: 'article'/)
  assert.match(importer, /method: 'POST', body: form/)
  assert.match(importer, /method: 'HEAD'/)
  assert.match(importer, /uploadImage\(coverUrl, `\$\{item\.title\} 封面`, robots\)/)
  assert.doesNotMatch(importer, /getWechatBodyImages|replaceWechatBodyImages|INSERT INTO article_images/)
  assert.match(importer, /legacy_source_table = 'wechat_album_image'/)
})

test('each source is full on its first successful sync and incremental after its saved cursor', () => {
  assert.match(importer, /const initial = !source\.initial_synced_at\s+const mode = initial \? 'full' : 'incremental'/)
  assert.match(importer, /const cursor = initial \? null : \{ messageId: source\.cursor_message_id, itemIndex: source\.cursor_item_index \}/)
  assert.match(importer, /initial_synced_at = IF\(\? = 1, NOW\(\), initial_synced_at\)/)
  assert.doesNotMatch(importer, /source\.initial_mode|mode === 'latest'|mode === 'baseline'/)
})

test('each source has an idempotent daily run record and only advances its cursor after success', () => {
  assert.match(importer, /GET_LOCK\(\?, 0\)/)
  assert.match(importer, /INSERT INTO wechat_album_runs/)
  assert.match(importer, /UPDATE wechat_album_sources SET cursor_message_id/)
  assert.match(importer, /await updateSourceCursor\(source, crawl\.latestItem as AlbumItem, initial\)[\s\S]*?await finishRun\(source, scheduledDate, 'success'/)
  assert.match(importer, /'already-completed-today'/)
})

test('crawler remains public-only, checks robots and rejects verification pages without credentials', () => {
  assert.match(importer, /getRobotsPolicy/)
  assert.match(importer, /isWechatRobotsAllowed/)
  assert.match(importer, /robots\.txt/)
  assert.match(importer, /访问限制或验证提示，已停止采集/)
  assert.doesNotMatch(importer, /Cookie|cookie|proxy|绕过/)
})

test('source categories stay configured for public article sections', async () => {
  const migration = await readFile(new URL('../../database/migrations/022_wechat_album_import.sql', import.meta.url), 'utf8')
  assert.match(migration, /'tro-2025-album'[\s\S]*?'tro-success'/)
  assert.match(migration, /'tro-classic-album'[\s\S]*?'tro-success'/)
  assert.match(migration, /'tro-knowledge-album'[\s\S]*?'knowledge'/)
  assert.match(migration, /'tro-2026-album'[\s\S]*?'tro-success'/)
  assert.match(migration, /'labor-public-album'[\s\S]*?'labor-case'/)
})

test('daily scheduler starts after 12:15 China time in production and can be disabled', () => {
  assert.match(scheduler, /millisecondsUntilFirstWechatAlbumRun\(\)/)
  assert.match(scheduler, /millisecondsUntilNextWechatAlbumRun\(\)/)
  assert.match(scheduler, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(scheduler, /NUXT_WECHAT_ALBUM_IMPORT_ENABLED === 'false'/)
  assert.match(scheduler, /runWechatAlbumImport\(\)/)
})
