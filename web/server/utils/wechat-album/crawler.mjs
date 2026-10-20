import { canonicalArticleUrl, parseAlbumJsonPage, parseAlbumPage } from './parser.mjs'

const PAGE_SIZE = 10
const MAX_PAGE_COUNT = 500

function cursorKey(item) {
  return `${item.messageId}:${item.itemIndex}`
}

function nextPageUrl(sourceUrl, item) {
  const source = new URL(sourceUrl)
  const biz = source.searchParams.get('__biz')
  const albumId = source.searchParams.get('album_id')
  if (!biz || !albumId) throw new Error('公众号专辑链接缺少 __biz 或 album_id 参数')
  const url = new URL('/mp/appmsgalbum', 'https://mp.weixin.qq.com')
  url.searchParams.set('action', 'getalbum')
  url.searchParams.set('__biz', biz)
  url.searchParams.set('album_id', albumId)
  url.searchParams.set('count', String(PAGE_SIZE))
  url.searchParams.set('begin_msgid', item.messageId)
  url.searchParams.set('begin_itemidx', item.itemIndex)
  url.searchParams.set('f', 'json')
  return url.toString()
}

function addUnique(items, identities, urls, incoming) {
  let duplicateCount = 0
  for (const item of incoming) {
    const identity = cursorKey(item)
    const articleUrl = canonicalArticleUrl(item.url)
    if (identities.has(identity) || !articleUrl || urls.has(articleUrl)) {
      duplicateCount += 1
      continue
    }
    identities.add(identity)
    urls.add(articleUrl)
    items.push(item)
  }
  return duplicateCount
}

/**
 * 按公众号专辑公开列表分页。只读列表与原文页面，不带登录 Cookie，
 * 首次全量、最新 N 篇、建立基线和后续增量共用这一分页器。
 */
export async function crawlWechatAlbum(options) {
  const {
    sourceUrl,
    mode = 'incremental',
    limit = 0,
    cursor = null,
    fetchFirstPage,
    fetchNextPage,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    pageDelayMs = 1000,
    maxPageCount = MAX_PAGE_COUNT,
  } = options ?? {}
  if (typeof fetchFirstPage !== 'function' || typeof fetchNextPage !== 'function') {
    throw new Error('公众号专辑采集缺少页面读取函数')
  }
  const albumUrl = new URL(sourceUrl)
  if (albumUrl.protocol !== 'https:' || albumUrl.hostname !== 'mp.weixin.qq.com'
    || albumUrl.pathname !== '/mp/appmsgalbum'
    || !albumUrl.searchParams.get('__biz') || !albumUrl.searchParams.get('album_id')) {
    throw new Error('公众号专辑来源链接无效')
  }
  if (!['baseline', 'latest', 'full', 'incremental'].includes(mode)) {
    throw new Error('公众号专辑同步模式无效')
  }
  if (mode === 'latest' && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('最新文章同步必须提供有效篇数')
  }
  if (mode === 'incremental' && (!cursor?.messageId || !cursor?.itemIndex)) {
    throw new Error('增量同步缺少已保存的文章游标')
  }

  const firstHtml = await fetchFirstPage(albumUrl.toString())
  const firstPage = parseAlbumPage(firstHtml, albumUrl.toString())
  const collected = []
  const identities = new Set()
  const urls = new Set()
  let duplicateCount = 0
  let pageCount = 1
  let latestItem = firstPage.items[0] ?? null

  if (mode === 'baseline') {
    return {
      items: [], pageCount, duplicateCount: 0, stoppedAtCursor: false,
      hasMore: firstPage.hasMore, latestItem,
    }
  }

  let page = firstPage
  let nextCursor = page.items.at(-1)
  let stoppedAtCursor = false

  while (page) {
    for (const item of page.items) {
      if (mode === 'incremental' && cursorKey(item) === `${cursor.messageId}:${cursor.itemIndex}`) {
        stoppedAtCursor = true
        break
      }
      duplicateCount += addUnique(collected, identities, urls, [item])
      if (mode === 'latest' && collected.length >= limit) break
    }

    if (stoppedAtCursor || (mode === 'latest' && collected.length >= limit) || !page.hasMore) break
    if (pageCount >= maxPageCount) throw new Error(`公众号专辑超过分页上限 ${maxPageCount} 页，已停止，避免不完整导入`)
    if (!nextCursor?.messageId || !nextCursor?.itemIndex) throw new Error('公众号专辑分页游标缺失，已停止')

    await sleep(pageDelayMs)
    const response = await fetchNextPage(nextPageUrl(albumUrl, nextCursor), albumUrl.toString())
    page = parseAlbumJsonPage(response)
    pageCount += 1
    nextCursor = page.items.at(-1)
  }

  return {
    items: collected,
    pageCount,
    duplicateCount,
    stoppedAtCursor,
    hasMore: Boolean(page?.hasMore),
    latestItem,
  }
}
