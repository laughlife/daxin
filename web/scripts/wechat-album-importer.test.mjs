import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const importer = await readFile(new URL('../server/utils/wechat-album/importer.ts', import.meta.url), 'utf8')
const scheduler = await readFile(new URL('../server/plugins/wechat-album-scheduler.ts', import.meta.url), 'utf8')

test('article import stores the full body, publish time, category and OSS cover using the existing article model', () => {
  assert.match(importer, /INSERT INTO articles[\s\S]*?content_html, content_text, category_id, cover_media_id, published_at/)
  assert.match(importer, /status, is_featured, show_in_sidebar, legacy_source_table, legacy_source_id/)
  assert.match(importer, /sanitizeHtml\(withSource\)/)
  assert.match(importer, /cover_media_id/)
  assert.match(importer, /WHERE slug = \? AND status = 1/)
})

test('article cover and body images are uploaded as verified article media and body URLs are replaced', () => {
  assert.match(importer, /createPostObjectPolicy\([\s\S]*?usageScope: 'article'/)
  assert.match(importer, /method: 'POST', body: form/)
  assert.match(importer, /method: 'HEAD'/)
  assert.match(importer, /replaceWechatBodyImages\(article\.bodyHtml, mediaByIdentity\)/)
  assert.match(importer, /INSERT INTO article_images/)
  assert.match(importer, /legacy_source_table = 'wechat_album_image'/)
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
  assert.match(importer, /robotsAllows/)
  assert.match(importer, /robots\.txt/)
  assert.match(importer, /访问限制或验证提示，已停止采集/)
  assert.doesNotMatch(importer, /Cookie|cookie|proxy|绕过/)
})

test('daily scheduler starts after 12:15 China time in production and can be disabled', () => {
  assert.match(scheduler, /millisecondsUntilFirstWechatAlbumRun\(\)/)
  assert.match(scheduler, /millisecondsUntilNextWechatAlbumRun\(\)/)
  assert.match(scheduler, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(scheduler, /NUXT_WECHAT_ALBUM_IMPORT_ENABLED === 'false'/)
  assert.match(scheduler, /runWechatAlbumImport\(\)/)
})
