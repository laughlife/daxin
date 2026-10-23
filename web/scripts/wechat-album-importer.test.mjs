import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const importer = await readFile(new URL('../server/utils/wechat-album/importer.ts', import.meta.url), 'utf8')
const scheduler = await readFile(new URL('../server/plugins/wechat-album-scheduler.ts', import.meta.url), 'utf8')

test('article import stores list metadata, category and OSS cover without requesting or saving the body', () => {
  assert.match(importer, /INSERT INTO articles[\s\S]*?content_html, content_text, category_id, cover_media_id, published_at/)
  assert.match(importer, /VALUES \(\?, \?, NULL, NULL, NULL, \?, \?, \?, \?, 'published'/)
  assert.match(importer, /status, is_featured, show_in_sidebar, legacy_source_table, legacy_source_id/)
  assert.doesNotMatch(importer, /parseWechatArticlePage/)
  assert.match(importer, /INSERT INTO wechat_album_items[\s\S]*?source_url, title, cover_source_url, published_at/)
  assert.match(importer, /findLegacyArticle\(item, categoryId\)/)
  assert.match(importer, /cover_media_id/)
  assert.match(importer, /WHERE slug = \? AND status = 1/)
})

test('cover prefers the article-page long image and falls back to the album square', () => {
  assert.match(importer, /const longCoverUrl = await readArticleLongCover\(identity\.url\)/)
  assert.match(importer, /const coverUrl = longCoverUrl \|\| normalizeWechatImageUrl\(item\.coverUrl\)/)
  assert.match(importer, /const coverIsLong = Boolean\(longCoverUrl\)/)
  assert.match(importer, /extractMsgCdnUrl\(html\)/)
  assert.match(importer, /resolveArticleCoverId\(/)
  // 抓文章页失败只告警，不 throw 中断整条采集
  assert.match(importer, /文章页长图获取失败，退回专辑方图/)
  assert.match(importer, /USER_AGENT = MOBILE_WECHAT_UA/)
  assert.doesNotMatch(importer, /const USER_AGENT = 'DaxinWechatAlbumSync/)
})

test('title font size is read from the rendered page and stored on both article and album item', () => {
  assert.match(importer, /titleFontSizeReader\.read\(identity\.url\)/)
  assert.match(importer, /titleFontSizeReader: TitleFontSizeReader/)
  assert.match(importer, /cover_media_id, published_at,\s*\n\s*title_font_size, status/)
  assert.match(importer, /title_font_size = COALESCE\(\?, title_font_size\)/)
  assert.match(importer, /published_at, title_font_size, created_at, updated_at/)
  assert.match(importer, /title_font_size = COALESCE\(VALUES\(title_font_size\), title_font_size\)/)
})

test('only the cover is uploaded as verified article media; body image handling is absent', () => {
  assert.match(importer, /createPostObjectPolicy\([\s\S]*?usageScope: 'article'/)
  assert.match(importer, /method: 'POST', body: form/)
  assert.match(importer, /method: 'HEAD'/)
  assert.match(importer, /uploadImage\(coverUrl, `\$\{item\.title\} 封面`\)/)
  assert.doesNotMatch(importer, /getWechatBodyImages|replaceWechatBodyImages|INSERT INTO article_images/)
  assert.match(importer, /legacy_source_table = 'wechat_album_image'/)
  assert.match(importer, /content_html = NULL, content_text = NULL/)
  assert.match(importer, /await deleteOssObject\(media\.object_key, config!/)
  assert.match(importer, /NOT EXISTS \(SELECT 1 FROM articles cover_ref WHERE cover_ref\.cover_media_id = m\.id\)/)
  assert.match(importer, /NOT EXISTS \(SELECT 1 FROM article_images other_ref WHERE other_ref\.media_id = m\.id AND other_ref\.article_id <> \?\)/)
})

test('deployment task fully syncs every pending source and daily runs increment from saved cursors', () => {
  assert.match(importer, /const full = deploymentFull \|\| !source\.deployment_full_synced_at \|\| !source\.initial_synced_at/)
  assert.match(importer, /const cursor = full \? null : \{ messageId: source\.cursor_message_id, itemIndex: source\.cursor_item_index \}/)
  assert.match(importer, /deployment_full_synced_at = IF\(\? = 1, COALESCE\(deployment_full_synced_at, NOW\(\)\), deployment_full_synced_at\)/)
  assert.match(importer, /export function runWechatAlbumDeploymentFullImport/)
  assert.match(importer, /WHERE enabled = 1 ORDER BY id/)
  assert.match(importer, /sync_mode !== 'full_once'/)
  assert.doesNotMatch(importer, /source\.initial_mode|mode === 'latest'|mode === 'baseline'/)
})

test('each source has an idempotent daily run record and only advances its cursor after success', () => {
  assert.match(importer, /GET_LOCK\(\?, 0\)/)
  assert.match(importer, /INSERT INTO wechat_album_runs/)
  assert.match(importer, /UPDATE wechat_album_sources SET cursor_message_id/)
  assert.match(importer, /await updateSourceCursor\(source, crawl\.latestItem as AlbumItem, full\)[\s\S]*?await finishRun\(source, scheduledDate, 'success'/)
  assert.match(importer, /'already-completed-today'/)
})

test('crawler remains public-only and rejects verification pages without credentials', () => {
  // 说明：微信采集已按要求移除 robots.txt 校验（不再请求/解析 mp.weixin.qq.com/robots.txt），
  // 这里改为断言「不再有 robots 相关逻辑」，避免它被无意加回来。
  assert.doesNotMatch(importer, /getRobotsPolicy|isWechatRobotsAllowed|parseWechatRobots/)
  assert.doesNotMatch(importer, /robots\.txt/)
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

test('production scheduler performs one deployment full import and retains daily incremental import', () => {
  assert.match(scheduler, /millisecondsUntilNextWechatAlbumMinute\(\)/)
  assert.match(scheduler, /runWechatAlbumDeploymentFullImport\(\)/)
  assert.match(scheduler, /await fullRunSettled/)
  assert.match(scheduler, /millisecondsUntilFirstWechatAlbumRun\(\)/)
  assert.match(scheduler, /millisecondsUntilNextWechatAlbumRun\(\)/)
  assert.match(scheduler, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(scheduler, /NUXT_WECHAT_ALBUM_IMPORT_ENABLED === 'false'/)
  assert.match(scheduler, /runWechatAlbumImport\(\)/)
})
