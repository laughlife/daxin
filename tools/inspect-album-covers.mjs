// 扫描某个专辑的所有分页，找出「封面为空」的条目，并输出其 <li> 原始 HTML，
// 用于判断：是专辑页本身没有封面，还是解析器没取到（标记变了）。
//
// 用法：node tools/inspect-album-covers.mjs <sourceKey>
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'
const { parseAlbumPage, parseAlbumJsonPage } = await import('../web/server/utils/wechat-album/parser.mjs')

const USER_AGENT = 'DaxinWechatAlbumSync/1.0 (+https://daxinfawu.com/)'
const sourceKey = process.argv[2] ?? 'tro-classic-album'
const target = resolveTargetConnection()
const rows = await queryRows(target,
  `SELECT album_url FROM wechat_album_sources WHERE source_key = '${sourceKey}' LIMIT 1`)
const albumUrl = rows[0]?.[0]
if (!albumUrl) {
  console.error(`未找到来源：${sourceKey}`)
  process.exit(1)
}

/**
 * 与 crawler.mjs 的 nextPageUrl 保持一致：重新构造干净的 URL，
 * 必须带 count 与 f=json，否则微信返回 HTML 而不是 JSON。
 * （最初我直接改原地址，结果第 2 页解析失败。）
 */
function nextPageUrl(sourceUrl, item) {
  const source = new URL(sourceUrl)
  const biz = source.searchParams.get('__biz')
  const albumId = source.searchParams.get('album_id')
  const url = new URL('/mp/appmsgalbum', 'https://mp.weixin.qq.com')
  url.searchParams.set('action', 'getalbum')
  url.searchParams.set('__biz', biz)
  url.searchParams.set('album_id', albumId)
  url.searchParams.set('count', '10')
  url.searchParams.set('begin_msgid', item.messageId)
  url.searchParams.set('begin_itemidx', item.itemIndex)
  url.searchParams.set('f', 'json')
  return url.toString()
}

async function getJson(url, referer) {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json,text/plain,*/*',
      referer,
      'x-requested-with': 'XMLHttpRequest',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  })
  return res.text()
}

// 首页为 HTML
const firstHtml = await (await fetch(albumUrl, {
  headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
})).text()

let page = parseAlbumPage(firstHtml, albumUrl)
let pageNo = 1
const noCover = []
let total = 0

function record(items) {
  total += items.length
  for (const item of items) {
    if (!item.coverUrl) noCover.push(item)
  }
}

record(page.items)
console.log(`第 ${pageNo} 页：${page.items.length} 条，累计无封面 ${noCover.length}`)

while (page.hasMore) {
  const last = page.items.at(-1)
  const body = await getJson(nextPageUrl(albumUrl, last), albumUrl)
  page = (() => {
    try { return parseAlbumJsonPage(body) } catch { return null }
  })()
  if (!page) {
    console.log(`第 ${pageNo + 1} 页解析失败（可能是验证页或结构变化），停止`)
    break
  }
  pageNo += 1
  record(page.items)
  console.log(`第 ${pageNo} 页：${page.items.length} 条，累计无封面 ${noCover.length}`)
  await new Promise((r) => setTimeout(r, 1200))
}

console.log(`\n共 ${total} 条，其中无封面 ${noCover.length} 条`)
for (const item of noCover.slice(0, 3)) {
  console.log(`\n--- 无封面：${item.title.slice(0, 40)} ---`)
  console.log(`  msgid=${item.messageId} itemidx=${item.itemIndex}`)
  console.log(`  coverUrl=${JSON.stringify(item.coverUrl)}`)
}
