// 把公众号文章封面从「专辑方图（150x150）」回填成「文章页长图（900x382）」，
// 同时用真实浏览器读取标题 computed font-size 存库。
//
// 关键实测结论（不要改成采集器 UA）：
// - 文章页必须用手机微信 UA 抓取，DaxinWechatAlbumSync/1.0 会被拦；
// - 长图地址在页面 JS 变量 `var msg_cdn_url = "..."` 里（900x382）；
// - 标题字号不在 HTML 里，是运行时 computed，必须用 Playwright + 本机 Chrome
//   读 `getComputedStyle(document.getElementById('activity-name')).fontSize`。
// headless 实测未被拦（2026-10-23），因此默认 headless=true；若出现「环境异常」
// 拦截，可用 --headful 切到有头模式重跑。
//
// 每篇文章只做一次浏览器访问：在 page.evaluate 里同时取标题、msg_cdn_url 和字号；
// 正文图片请求全部拦掉，单页约 2 秒。
//
// 用法：
//   node tools/backfill-wechat-covers.mjs --limit 3 --dry-run
//   node tools/backfill-wechat-covers.mjs --limit 5
//   node tools/backfill-wechat-covers.mjs                 # 全量
// 可选：--headful  --sleep 1000  --log <路径>
//
// 断点续跑：articles.cover_media_id 非空且 wechat_album_items.title_font_size 非空即跳过。
// 同一篇文章出现在多个专辑里（818 条目 → 800 篇）时，第二次只补该条目的字号，不重复抓取/上传。
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  REPO_ROOT,
  executeSql,
  queryRows,
  quoteLiteral,
  resolveTargetConnection,
} from './migrate-legacy/mysql-client.mjs'
import {
  MIME,
  isOssConfigComplete,
  objectKeyFor,
  publicUrlFor,
  putObject,
  readImageSize,
  readOssConfig,
  sniffImageExtension,
} from './migrate-legacy/oss-client.mjs'

const MOBILE_WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40 NetType=WIFI Language/zh_CN'
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || 'file:///D:/AppData/playwright/node_modules/playwright-core/index.mjs'
const BROWSER_EXECUTABLE = process.env.BROWSER_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OSS_PREFIX = 'wechat-covers'
const BLOCK_PATTERN = /环境异常|访问过于频繁|去验证|请输入验证码|该内容已被发布者删除|此内容因违规无法查看/

function parseArgs(argv) {
  const options = {
    limit: 0,
    dryRun: false,
    headful: false,
    sleepMs: 1000,
    logPath: join(REPO_ROOT, 'backup', 'backfill-log.txt'),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--limit') options.limit = Math.max(0, Number(argv[++index] ?? 0))
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--headful') options.headful = true
    else if (arg === '--sleep') options.sleepMs = Math.max(0, Number(argv[++index] ?? 1000))
    else if (arg === '--log') options.logPath = String(argv[++index] ?? options.logPath)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function logLine(options, text) {
  const line = `[${new Date().toISOString()}] ${text}`
  console.log(text)
  mkdirSync(dirname(options.logPath), { recursive: true })
  appendFileSync(options.logPath, `${line}\n`, 'utf8')
}

/** 从 "22px" 取出整数 22；非法值返回 null。 */
function parseFontSize(raw) {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*px\s*$/i.exec(String(raw ?? ''))
  if (!match) return null
  const value = Math.round(Number(match[1]))
  return value >= 1 && value <= 255 ? value : null
}

/** 用手机微信 UA 抓页面，作为浏览器取长图失败时的兜底。 */
async function fetchArticleHtml(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': MOBILE_WECHAT_UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(45000),
  })
  const html = await response.text()
  const cdn = /var\s+msg_cdn_url\s*=\s*"([^"]+)"/.exec(html)
  const titleMatch = /<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/.exec(html)
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  return { status: response.status, msgCdnUrl: cdn ? cdn[1] : '', title }
}

/** 打开文章页并一次性取标题、msg_cdn_url、字号；失败时区分「被拦」与「其它」。 */
async function readArticleInBrowser(context, url) {
  const page = await context.newPage()
  try {
    // 正文配图对取字号没有影响，全部拦掉可把单页加载压到 2 秒内。
    await page.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (type === 'image' || type === 'media' || type === 'font') return route.abort()
      return route.continue()
    })
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForSelector('#activity-name', { timeout: 20000 })
    const data = await page.evaluate(() => {
      const el = document.getElementById('activity-name')
      const style = el ? getComputedStyle(el) : null
      const inner = el ? el.querySelector('.js_title_inner') : null
      return {
        fontSize: style ? style.fontSize : '',
        title: (inner ? inner.textContent : (el ? el.textContent : '') || '').trim(),
        msgCdnUrl: typeof window.msg_cdn_url === 'string' ? window.msg_cdn_url : '',
        bodySnippet: document.body ? document.body.innerText.slice(0, 200) : '',
      }
    })
    return { ok: true, httpStatus: response ? response.status() : 0, blocked: false, ...data }
  } catch (error) {
    const bodySnippet = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 300) : '')).catch(() => '')
    return { ok: false, blocked: BLOCK_PATTERN.test(bodySnippet), reason: error.message, bodySnippet }
  } finally {
    await page.close().catch(() => {})
  }
}

/** 下载长图（mmbiz 需要微信 UA + 微信 referer）。 */
async function downloadImage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': MOBILE_WECHAT_UA,
      Referer: 'https://mp.weixin.qq.com/',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`长图下载失败 HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length < 512) throw new Error(`长图内容过小（${body.length} bytes）`)
  const extension = sniffImageExtension(body, response.headers.get('content-type') ?? '', url)
  if (!extension) throw new Error('无法识别长图格式')
  return { body, extension, contentType: MIME[extension] ?? 'application/octet-stream' }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/backfill-wechat-covers.mjs [--limit N] [--dry-run] [--headful] [--sleep ms] [--log path]')
    return
  }

  const target = resolveTargetConnection()
  if (!target) throw new Error('无法解析目标库连接（检查 web/.env 的 DB_*）')
  const config = readOssConfig()
  if (!isOssConfigComplete(config)) throw new Error('OSS 配置不完整（检查 web/.env 的 ALIYUN_OSS_*）')

  // 候选：有文章关联、来源地址是 http 的专辑条目。
  const rows = await queryRows(target, `
SELECT i.id, i.article_id, i.source_url, i.title, IFNULL(i.title_font_size, ''),
       IFNULL(a.cover_media_id, ''), a.slug
FROM wechat_album_items i
JOIN articles a ON a.id = i.article_id
WHERE i.article_id IS NOT NULL AND i.source_url LIKE 'http%'
ORDER BY i.id`)
  const all = rows.map((row) => ({
    itemId: Number(row[0]),
    articleId: Number(row[1]),
    sourceUrl: String(row[2]),
    title: String(row[3]),
    itemFontSize: row[4] === '' ? null : Number(row[4]),
    coverMediaId: row[5] === '' ? null : Number(row[5]),
    slug: String(row[6]),
  }))
  if (all.length === 0) {
    console.log('没有可回填的专辑条目')
    return
  }

  // 断点续跑：封面与字号都已就绪即跳过。
  let skipped = 0
  let pending = all.filter((item) => {
    const complete = item.coverMediaId !== null && item.itemFontSize !== null
    if (complete) skipped += 1
    return !complete
  })
  if (options.limit > 0) pending = pending.slice(0, options.limit)

  logLine(options, `回填开始${options.dryRun ? '（dry-run，不写库）' : ''}：候选 ${all.length} 条，已完成跳过 ${skipped} 条，本次处理 ${pending.length} 条`)
  if (pending.length === 0) {
    logLine(options, '没有需要处理的条目')
    return
  }

  const { chromium } = await import(PLAYWRIGHT_MODULE)
  const browser = await chromium.launch({
    headless: !options.headful,
    executablePath: BROWSER_EXECUTABLE,
    args: ['--disable-blink-features=AutomationControlled'],
    timeout: 90000,
  })
  const context = await browser.newContext({
    userAgent: MOBILE_WECHAT_UA,
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })

  const stats = { success: 0, cached: 0, failed: 0, fontMissing: 0 }
  const failures = []
  // 同一篇文章可能出现在多个专辑里：本次运行内复用抓取结果，只补条目字号。
  const articleCache = new Map()

  /** 取（或复用）一篇文章的抓取结果；拿不到长图就抛错。 */
  async function fetchArticle(item) {
    const cachedEntry = articleCache.get(item.articleId)
    if (cachedEntry) return { entry: cachedEntry, reuse: true }

    let result = await readArticleInBrowser(context, item.sourceUrl)
    if (!result.ok || !result.msgCdnUrl) {
      // 浏览器路径没拿到长图时，用手机 UA 的普通 HTTP 再试一次。
      const fallback = await fetchArticleHtml(item.sourceUrl).catch(() => null)
      if (fallback && fallback.msgCdnUrl) {
        result = {
          ok: true,
          title: fallback.title || result.title || '',
          msgCdnUrl: fallback.msgCdnUrl,
          fontSize: result.fontSize ?? '',
          bodySnippet: result.bodySnippet ?? '',
          blocked: false,
        }
      }
    }
    if (!result.ok || !result.msgCdnUrl) {
      const blocked = Boolean(result.blocked) || BLOCK_PATTERN.test(result.bodySnippet ?? '')
      throw new Error(blocked
        ? `被拦截（${result.reason ?? '页面提示环境异常'}）`
        : `未取到 msg_cdn_url（${result.reason ?? '页面无该变量'}）`)
    }

    const entry = {
      title: result.title || '',
      msgCdnUrl: result.msgCdnUrl,
      rawFontSize: result.fontSize || '',
      fontSize: parseFontSize(result.fontSize),
      blocked: Boolean(result.blocked),
      written: null,
    }
    articleCache.set(item.articleId, entry)
    return { entry, reuse: false }
  }

  try {
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index]
      const label = `[${index + 1}/${pending.length}] item=${item.itemId} article=${item.articleId}`
      try {
        const { entry, reuse } = await fetchArticle(item)
        const title = item.title || entry.title || ''
        const urlPreview = entry.msgCdnUrl.slice(0, 80) + (entry.msgCdnUrl.length > 80 ? '…' : '')

        if (options.dryRun) {
          console.log(label)
          console.log(`  标题: ${title.slice(0, 80)}`)
          console.log(`  长图: ${urlPreview}`)
          console.log(`  字号: ${entry.rawFontSize || '（未取到）'}${entry.fontSize ? ` → ${entry.fontSize}` : ''}`)
          console.log(`  被拦: ${entry.blocked ? '是' : '否'}${reuse ? '（同文章复用本次抓取结果）' : ''}`)
          stats.success += 1
        } else if (reuse && entry.written) {
          // 同一篇文章的第二条专辑记录：不重复上传，只补该条目的字号。
          const fontSql = entry.written.fontSize === null ? 'NULL' : String(entry.written.fontSize)
          await executeSql(target, `UPDATE wechat_album_items SET title_font_size = ${fontSql} WHERE id = ${item.itemId}`)
          stats.cached += 1
          logLine(options, `${label} 复用文章 ${item.articleId} 的封面 media=${entry.written.mediaId}，补条目字号=${entry.written.fontSize ?? 'NULL'}`)
        } else {
          // 1) 下载长图并上传 OSS
          const image = await downloadImage(entry.msgCdnUrl)
          const size = readImageSize(image.body, image.extension)
          const objectKey = objectKeyFor(`wechat-album-cover:${item.articleId}`, image.extension, OSS_PREFIX)
          const response = await putObject(config, { objectKey, body: image.body, contentType: image.contentType })
          if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`OSS 上传失败 HTTP ${response.status} ${text.slice(0, 120)}`)
          }
          const publicUrl = publicUrlFor(config, objectKey)

          // 2) 登记 media_assets（object_key 唯一，重跑复用同一行）
          const fileName = `wechat-cover-${item.articleId}${image.extension}`
          const assetRows = await queryRows(target, `
INSERT INTO media_assets
  (object_key, public_url, file_name, mime_type, byte_size, width, height, usage_scope, title,
   legacy_source_table, legacy_source_id, created_at, updated_at)
VALUES
  (${quoteLiteral(objectKey)}, ${quoteLiteral(publicUrl)}, ${quoteLiteral(fileName)}, ${quoteLiteral(image.contentType)},
   ${image.body.length}, ${size?.width ?? 'NULL'}, ${size?.height ?? 'NULL'}, 'article', ${quoteLiteral(title.slice(0, 255))},
   'wechat_album_image', ${item.articleId}, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  public_url = VALUES(public_url), file_name = VALUES(file_name), mime_type = VALUES(mime_type),
  byte_size = VALUES(byte_size), width = VALUES(width), height = VALUES(height), usage_scope = 'article',
  title = VALUES(title), legacy_source_table = 'wechat_album_image', legacy_source_id = VALUES(legacy_source_id),
  deleted_at = NULL, updated_at = NOW();
SELECT id FROM media_assets WHERE object_key = ${quoteLiteral(objectKey)} LIMIT 1;`)
          const mediaId = Number(assetRows[0]?.[0] ?? 0)
          if (!mediaId) throw new Error('media_assets 写入后取不到 id')

          // 3) 回写封面与字号（文章 + 专辑条目）
          const fontSql = entry.fontSize === null ? 'NULL' : String(entry.fontSize)
          await executeSql(target, `
UPDATE articles SET cover_media_id = ${mediaId}, title_font_size = ${fontSql} WHERE id = ${item.articleId};
UPDATE wechat_album_items SET title_font_size = ${fontSql} WHERE id = ${item.itemId};`)

          entry.written = { mediaId, fontSize: entry.fontSize }
          stats.success += 1
          if (entry.fontSize === null) stats.fontMissing += 1
          logLine(options, `${label} 标题=${title.slice(0, 40)} 字号=${entry.fontSize ?? 'NULL'} 尺寸=${size ? `${size.width}x${size.height}` : '?'} ${Math.round(image.body.length / 1024)}KB → ${objectKey}${entry.fontSize === null ? '（字号缺失，下次重跑会重试）' : ''}`)
        }
      } catch (error) {
        stats.failed += 1
        failures.push({ itemId: item.itemId, articleId: item.articleId, title: item.title.slice(0, 60), error: error.message })
        logLine(options, `${label} 失败：${error.message}`)
      }

      if (index + 1 < pending.length) await sleep(options.sleepMs)
      if ((index + 1) % 10 === 0 || index + 1 === pending.length) {
        logLine(options, `进度 ${index + 1}/${pending.length}：成功 ${stats.success}，复用 ${stats.cached}，失败 ${stats.failed}，跳过 ${skipped}`)
      }
    }
  } finally {
    await browser.close().catch(() => {})
  }

  logLine(options, `回填结束：成功 ${stats.success}，复用 ${stats.cached}，失败 ${stats.failed}，跳过 ${skipped}，字号缺失 ${stats.fontMissing}`)
  if (failures.length > 0) {
    logLine(options, `失败明细（前 20 条）：${JSON.stringify(failures.slice(0, 20))}`)
  }

  // 收尾核对：全库仍缺封面或字号的条目数。
  if (!options.dryRun) {
    const check = await queryRows(target, `
SELECT SUM(a.cover_media_id IS NULL), SUM(i.title_font_size IS NULL), COUNT(*)
FROM wechat_album_items i JOIN articles a ON a.id = i.article_id
WHERE i.article_id IS NOT NULL AND i.source_url LIKE 'http%'`)
    const [missingCover, missingFont, total] = check[0] ?? []
    logLine(options, `全库核对：条目 ${total} 条，缺封面 ${missingCover} 条，缺字号 ${missingFont} 条`)
  }

  if (stats.failed > 0) process.exitCode = stats.success + stats.cached > 0 ? 0 : 1
}

main().catch((error) => {
  console.error(`回填失败：${error.message}`)
  process.exitCode = 1
})
