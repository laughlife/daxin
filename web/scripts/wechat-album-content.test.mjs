import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendWechatSourceLink,
  getWechatBodyImages,
  htmlToPlainText,
  normalizeWechatImageUrl,
  replaceWechatBodyImages,
  wechatImageIdentity,
} from '../server/utils/wechat-album/content.mjs'

const cover = 'https://mmbiz.qpic.cn/mmbiz_jpg/album/cover/0?wx_fmt=jpeg'
const bodyImage = 'https://mmbiz.qpic.cn/mmbiz_png/album/body/1?wx_fmt=png'

test('WeChat images are restricted to the official CDN and identified without transformation parameters', () => {
  assert.equal(normalizeWechatImageUrl('//mmbiz.qpic.cn/a/b'), 'https://mmbiz.qpic.cn/a/b')
  assert.equal(normalizeWechatImageUrl('https://example.com/a.png'), '')
  assert.equal(wechatImageIdentity(`${bodyImage}&wxfrom=5`), wechatImageIdentity(bodyImage))
})

test('body image extraction deduplicates images and excludes the cover from the article body', () => {
  const images = getWechatBodyImages(`<p><img src="${cover}"></p><img data-src="${bodyImage}" alt="正文图"><img src="${bodyImage}&wxfrom=5">`, cover)
  assert.equal(images.length, 1)
  assert.equal(images[0].url, bodyImage)
  assert.equal(images[0].alt, '正文图')
})

test('body images are replaced with OSS URLs and unsafe or unmapped images are removed', () => {
  const mapping = new Map([[wechatImageIdentity(bodyImage), { publicUrl: 'https://cdn.example.com/20261020/body.png' }]])
  const html = replaceWechatBodyImages(`<p>正文</p><img data-src="${bodyImage}" alt="说明"><img src="https://example.com/tracker">`, mapping)
  assert.match(html, /src="https:\/\/cdn\.example\.com\/20261020\/body\.png" alt="说明"/)
  assert.doesNotMatch(html, /mmbiz\.qpic|example\.com\/tracker/)
})

test('source link only accepts the public WeChat article host and plain text keeps paragraphs', () => {
  const linked = appendWechatSourceLink('<p>正文</p>', 'https://mp.weixin.qq.com/s/example')
  assert.match(linked, /查看微信公众号原文/)
  assert.equal(appendWechatSourceLink('<p>正文</p>', 'https://example.com/'), '<p>正文</p>')
  assert.equal(htmlToPlainText('<p>第一段</p><p>第二段 &amp; 说明</p>'), '第一段\n第二段 & 说明')
})
