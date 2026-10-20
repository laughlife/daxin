import assert from 'node:assert/strict'
import test from 'node:test'
import { crawlWechatAlbum } from '../server/utils/wechat-album/crawler.mjs'

const sourceUrl = 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Example&album_id=900'

const albumPage = (items, hasMore = false) => `<div class="album__content js_album_bd">${items.map(item => `
  <li class="album__list-item" data-msgid="${item.messageId}" data-itemidx="${item.itemIndex}" data-link="${item.url}" data-title="${item.title}">
    <span class="js_article_create_time">2026-10-19</span><div class="album__item-img" style="background-image:url('${item.coverUrl}')"></div>
  </li>`).join('')}</div><script>var x = { continue_flag: '${hasMore ? 1 : 0}'*1, reverse_continue_flag: 0 }</script>`

const article = (messageId, itemIndex, mid, title = '文章') => ({
  messageId,
  itemIndex: String(itemIndex),
  url: `https://mp.weixin.qq.com/s?__biz=Example&mid=${mid}&idx=1&sn=${mid}`,
  title,
  coverUrl: `https://mmbiz.qpic.cn/cover-${mid}.jpg`,
})

test('first full sync walks every list page and keeps each listing row once', async () => {
  const first = [article('m3', 1, 103), article('m2', 1, 102)]
  const second = [article('m1', 1, 101)]
  const requests = []
  const result = await crawlWechatAlbum({
    sourceUrl,
    mode: 'full',
    fetchFirstPage: async url => { requests.push(url); return albumPage(first, true) },
    fetchNextPage: async url => { requests.push(url); return { base_resp: { ret: 0 }, getalbum_resp: { continue_flag: 0, article_list: second.map(item => ({ msgid: item.messageId, itemidx: item.itemIndex, url: item.url, title: item.title, cover_img_1_1: item.coverUrl })) } } },
    sleep: async () => {},
  })
  assert.equal(result.pageCount, 2)
  assert.deepEqual(result.items.map(item => item.messageId), ['m3', 'm2', 'm1'])
  assert.equal(new URL(requests[1]).searchParams.get('begin_msgid'), 'm2')
})

test('initial latest sync imports only the requested newest rows', async () => {
  const items = [article('m5', 1, 105), article('m4', 1, 104), article('m3', 1, 103), article('m2', 1, 102), article('m1', 1, 101)]
  const result = await crawlWechatAlbum({
    sourceUrl,
    mode: 'latest',
    limit: 4,
    fetchFirstPage: async () => albumPage(items, true),
    fetchNextPage: async () => { throw new Error('latest mode should not paginate') },
    sleep: async () => {},
  })
  assert.deepEqual(result.items.map(item => item.messageId), ['m5', 'm4', 'm3', 'm2'])
  assert.equal(result.latestItem.messageId, 'm5')
})

test('baseline records the newest cursor without importing old posts', async () => {
  const result = await crawlWechatAlbum({
    sourceUrl,
    mode: 'baseline',
    fetchFirstPage: async () => albumPage([article('m5', 1, 105), article('m4', 1, 104)], true),
    fetchNextPage: async () => { throw new Error('baseline mode should not paginate') },
    sleep: async () => {},
  })
  assert.equal(result.items.length, 0)
  assert.equal(result.latestItem.messageId, 'm5')
})

test('incremental sync stops at the stored message cursor after collecting newer rows', async () => {
  const newer = [article('m7', 1, 107), article('m6', 1, 106), article('m5', 1, 105)]
  const requests = []
  const result = await crawlWechatAlbum({
    sourceUrl,
    mode: 'incremental',
    cursor: { messageId: 'm5', itemIndex: '1' },
    fetchFirstPage: async url => { requests.push(url); return albumPage(newer, true) },
    fetchNextPage: async () => { throw new Error('cursor is on first page') },
    sleep: async () => {},
  })
  assert.deepEqual(result.items.map(item => item.messageId), ['m7', 'm6'])
  assert.equal(result.stoppedAtCursor, true)
  assert.equal(requests.length, 1)
})

test('validates public album URLs and requires a cursor for incremental sync', async () => {
  const options = { fetchFirstPage: async () => '', fetchNextPage: async () => null }
  await assert.rejects(crawlWechatAlbum({ ...options, sourceUrl: 'https://example.com/album', mode: 'baseline' }), /来源链接无效/)
  await assert.rejects(crawlWechatAlbum({ ...options, sourceUrl, mode: 'incremental' }), /缺少已保存的文章游标/)
})
