import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalArticleUrl,
  parseAlbumJsonPage,
  parseAlbumPage,
  parseWechatArticlePage,
  parseWechatPublishedAt,
} from '../server/utils/wechat-album/parser.mjs'

const albumUrl = 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Example&album_id=123'
const articleUrl = 'https://mp.weixin.qq.com/s?__biz=Example&mid=100&idx=1&sn=abc#wechat_redirect'

test('parses public album list rows, cover and next-page flag', () => {
  const html = `<div class="album__content js_album_bd">
    <li class="album__list-item" data-msgid="m-1" data-itemidx="1" data-link="/s?__biz=Example&amp;mid=100&amp;idx=1&amp;sn=abc" data-title="劳动用工指南&amp;风险提示">
      <span class="js_article_create_time">2026-10-19 09:30</span>
      <div class="album__item-img" style="background-image:url('https://mmbiz.qpic.cn/mmbiz_png/sample/0?wx_fmt=png')"></div>
    </li>
  </div><script>var album = { continue_flag: '1'*1, reverse_continue_flag: 0 };</script>`
  const result = parseAlbumPage(html, albumUrl)
  assert.equal(result.hasMore, true)
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0], {
    messageId: 'm-1',
    itemIndex: '1',
    url: 'https://mp.weixin.qq.com/s?__biz=Example&mid=100&idx=1&sn=abc',
    title: '劳动用工指南&风险提示',
    publishedAt: '2026-10-19 09:30:00',
    coverUrl: 'https://mmbiz.qpic.cn/mmbiz_png/sample/0?wx_fmt=png',
  })
})

test('parses album pagination JSON and rejects incomplete or non-article links', () => {
  const result = parseAlbumJsonPage(JSON.stringify({
    base_resp: { ret: 0 },
    getalbum_resp: {
      continue_flag: 1,
      article_list: [
        { msgid: 'm-2', itemidx: 2, url: '/s?__biz=Example&mid=101&idx=2&sn=def', title: '第二篇', create_time: '1792373400', cover_img_1_1: '//mmbiz.qpic.cn/mmbiz_jpg/sample/0' },
        { msgid: 'bad', itemidx: 1, url: 'https://example.com/not-wechat', title: '外部链接' },
      ],
    },
  }))
  assert.equal(result.hasMore, true)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].messageId, 'm-2')
  assert.equal(result.items[0].coverUrl, 'https://mmbiz.qpic.cn/mmbiz_jpg/sample/0')
})

test('extracts complete nested article body, metadata, and lazy image URLs', () => {
  const html = `<html><head><meta property="og:image" content="https://mmbiz.qpic.cn/cover.jpg">
    <meta property="og:title" content="文章标题 - 劳动法公众号"></head><body>
    <h1 id="activity-name">文章标题</h1><span id="js_name">劳动法公众号</span>
    <em id="publish_time">2026年10月19日</em>
    <div id="js_content"><p>正文第一段</p><div><p>嵌套内容</p>
      <img data-src="https://mmbiz.qpic.cn/mmbiz_png/body/0?wx_fmt=png" alt="正文配图">
      <img src="data:image/gif;base64,aaa" data-src="https://mmbiz.qpic.cn/mmbiz_jpg/body2/0" title="第二图">
    </div><script>const marker = "</div>";</script></div></body></html>`
  const result = parseWechatArticlePage(html, articleUrl)
  assert.equal(result.title, '文章标题')
  assert.equal(result.publishedAt, '2026-10-19 00:00:00')
  assert.equal(result.coverUrl, 'https://mmbiz.qpic.cn/cover.jpg')
  assert.equal(result.accountName, '劳动法公众号')
  assert.match(result.bodyHtml, /嵌套内容/)
  assert.equal(result.imageUrls.length, 2)
  assert.equal(result.imageUrls[0].alt, '正文配图')
  assert.equal(result.imageUrls[1].url, 'https://mmbiz.qpic.cn/mmbiz_jpg/body2/0')
})

test('normalizes timestamps to Shanghai time and canonicalizes album tracking parameters', () => {
  assert.equal(parseWechatPublishedAt('1792373400'), '2026-10-19 09:30:00')
  assert.equal(
    canonicalArticleUrl('https://mp.weixin.qq.com/s?mid=100&subscene=1&__biz=Example&idx=1&sn=abc#wechat_redirect'),
    'https://mp.weixin.qq.com/s?__biz=Example&idx=1&mid=100&sn=abc',
  )
})

test('fails closed when an album or article page is blocked or has no article body', () => {
  assert.throws(() => parseAlbumPage('<html>请在微信客户端打开</html>', albumUrl), /没有可读取的文章列表/)
  assert.throws(() => parseWechatArticlePage('<html>安全验证</html>', articleUrl), /访问限制/)
  assert.throws(() => parseWechatArticlePage('<html><h1>题目</h1></html>', articleUrl), /没有正文内容/)
})
