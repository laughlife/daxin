// 逐个来源试解析第一页（只读、不写库、不上传 OSS），快速确认解析链路是否整体可用。
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const { parseAlbumPage } = await import('../web/server/utils/wechat-album/parser.mjs')

const USER_AGENT = 'DaxinWechatAlbumSync/1.0 (+https://daxinfawu.com/)'
const target = resolveTargetConnection()
const rows = await queryRows(target,
  'SELECT source_key, name, album_url FROM wechat_album_sources WHERE enabled = 1 ORDER BY id')

console.log(`共 ${rows.length} 个启用来源，逐个试解析首页：\n`)
let ok = 0
for (const [key, name, url] of rows) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      console.log(`  ✖ ${key.padEnd(22)} HTTP ${response.status}`)
      continue
    }
    const html = await response.text()
    const page = parseAlbumPage(html, url)
    const first = page.items[0]
    console.log(`  ✔ ${key.padEnd(22)} 条目 ${String(page.items.length).padStart(2)}  hasMore=${page.hasMore}`)
    console.log(`      ${first.title.slice(0, 46)}`)
    console.log(`      ${first.publishedAt}  cover=${first.coverUrl ? '有' : '无'}`)
    ok += 1
  } catch (error) {
    console.log(`  ✖ ${key.padEnd(22)} ${error.message}`)
  }
  // 礼貌间隔，避免触发访问频率限制
  await new Promise((resolve) => setTimeout(resolve, 1200))
}

console.log(`\n结果：${ok}/${rows.length} 个来源可正常解析`)
process.exitCode = ok === rows.length ? 0 : 1
void executeSql
