// 公众号文章页解析的纯函数单测：长图提取、字号解析、封面优先级判定。
//
// 这些逻辑决定「长图不会被方图覆盖回去」和「字号入库是否合法」，
// 因此不依赖浏览器与数据库单独覆盖。
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractMsgCdnUrl,
  isWideCover,
  parseFontSizePx,
  resolveArticleCoverId,
} from '../server/utils/wechat-album/article-page.ts'

test('extractMsgCdnUrl 只认文章页内联脚本里的 msg_cdn_url', () => {
  const html = '... var msg_cdn_url = "https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/0?wx_fmt=jpeg"; var other = 1;'
  assert.equal(extractMsgCdnUrl(html), 'https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/0?wx_fmt=jpeg')
  // http 统一升级为 https
  assert.equal(extractMsgCdnUrl('var msg_cdn_url = "http://mmbiz.qpic.cn/a/0"'), 'https://mmbiz.qpic.cn/a/0')
  // 变量缺失、空值、非 http(s) 都返回空串
  assert.equal(extractMsgCdnUrl('<html></html>'), '')
  assert.equal(extractMsgCdnUrl('var msg_cdn_url = ""'), '')
  assert.equal(extractMsgCdnUrl('var msg_cdn_url = "javascript:alert(1)"'), '')
  assert.equal(extractMsgCdnUrl(''), '')
  // 允许中间任意空白
  assert.equal(extractMsgCdnUrl('var  msg_cdn_url\t=\t"https://mmbiz.qpic.cn/b/0"'), 'https://mmbiz.qpic.cn/b/0')
})

test('parseFontSizePx 把 "20px" 这样的 computed 值转成整数像素', () => {
  assert.equal(parseFontSizePx('20px'), 20)
  assert.equal(parseFontSizePx(' 22px '), 22)
  assert.equal(parseFontSizePx('22.4px'), 22)
  assert.equal(parseFontSizePx('17.6px'), 18)
  // 非法值一律 null，避免把脏数据写进 SMALLINT
  assert.equal(parseFontSizePx(''), null)
  assert.equal(parseFontSizePx(null), null)
  assert.equal(parseFontSizePx(undefined), null)
  assert.equal(parseFontSizePx('22'), null)
  assert.equal(parseFontSizePx('0px'), null)
  assert.equal(parseFontSizePx('300px'), null)
  assert.equal(parseFontSizePx('auto'), null)
})

test('isWideCover 按宽高判断长图（900x382 是长图，150x150 不是）', () => {
  assert.equal(isWideCover(900, 382), true)
  assert.equal(isWideCover(939, 400), true)
  assert.equal(isWideCover(150, 150), false)
  assert.equal(isWideCover(800, 800), false)
  assert.equal(isWideCover(400, 200), false)
  assert.equal(isWideCover(null, 382), false)
  assert.equal(isWideCover(900, null), false)
})

test('resolveArticleCoverId：长图优先，且方图不会把已有长图覆盖回去', () => {
  const wideExisting = { existingCoverId: 11, existingCoverWidth: 900, existingCoverHeight: 382 }
  const squareExisting = { existingCoverId: 12, existingCoverWidth: 150, existingCoverHeight: 150 }

  // 本次拿到长图：直接覆盖，即使现有已是长图
  assert.equal(resolveArticleCoverId({ ...wideExisting, nextCoverId: 21, nextIsLong: true }), 21)

  // 本次只有方图、现有是长图：保留现有（旧 COALESCE 会覆盖，这是要修的 bug）
  assert.equal(resolveArticleCoverId({ ...wideExisting, nextCoverId: 22, nextIsLong: false }), 11)

  // 本次只有方图、现有是方图：用新方图
  assert.equal(resolveArticleCoverId({ ...squareExisting, nextCoverId: 22, nextIsLong: false }), 22)

  // 文章没有封面：方图也照常写入
  assert.equal(resolveArticleCoverId({
    existingCoverId: null, existingCoverWidth: null, existingCoverHeight: null, nextCoverId: 22, nextIsLong: false,
  }), 22)

  // 新封面上传失败（null）：保留现有，绝不清空
  assert.equal(resolveArticleCoverId({ ...wideExisting, nextCoverId: null, nextIsLong: true }), 11)
  assert.equal(resolveArticleCoverId({
    existingCoverId: null, existingCoverWidth: null, existingCoverHeight: null, nextCoverId: null, nextIsLong: false,
  }), null)
})
