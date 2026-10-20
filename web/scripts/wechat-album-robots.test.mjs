import assert from 'node:assert/strict'
import test from 'node:test'
import { isWechatRobotsAllowed, parseWechatRobots } from '../server/utils/wechat-album/robots.mjs'

const agent = 'DaxinWechatAlbumSync/1.0 (+https://daxinfawu.com/)'

test('robots.txt wildcard and specific groups are applied to the configured public crawler', () => {
  const policy = parseWechatRobots(`User-agent: *\nDisallow: /private/\n\nUser-agent: DaxinWechatAlbumSync\nAllow: /mp/s/\nDisallow: /mp/`, agent)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/private/x'), false)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/article'), true)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/appmsgalbum'), false)
})

test('robots.txt wildcard patterns, end anchors, longest matching rules and crawl delay are respected', () => {
  const policy = parseWechatRobots(`User-agent: *\nDisallow: /mp/*?secret=\nDisallow: /mp/s/private$\nAllow: /mp/s/public$\nCrawl-delay: 2`, agent)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/private?secret=1'), false)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/private'), false)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/private-more'), true)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/public'), true)
  assert.equal(isWechatRobotsAllowed(policy, 'https://mp.weixin.qq.com/mp/s/public-more'), true)
  assert.equal(policy.crawlDelayMs, 2000)
})

test('empty or missing directives allow ordinary public paths', () => {
  assert.equal(isWechatRobotsAllowed(parseWechatRobots('', agent), 'https://mp.weixin.qq.com/mp/appmsgalbum'), true)
})
