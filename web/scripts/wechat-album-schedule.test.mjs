import assert from 'node:assert/strict'
import test from 'node:test'
import {
  millisecondsUntilFirstWechatAlbumRun,
  millisecondsUntilNextWechatAlbumMinute,
  millisecondsUntilNextWechatAlbumRun,
  wechatShanghaiDateKey,
} from '../server/utils/wechat-album/schedule.mjs'

const offset = (year, month, day, hour, minute) => Date.UTC(year, month - 1, day, hour - 8, minute)

test('daily job runs twice: 00:15 and 12:15 Shanghai time, and catches up in the same slot', () => {
  // 12:14 → 今天 00:15 班次已过，首跑立即补跑（12:15 那次会被台账拦掉）
  const beforeNoon = new Date(offset(2026, 10, 20, 12, 14))
  assert.equal(millisecondsUntilFirstWechatAlbumRun(beforeNoon), 0)

  // 12:16 → 当天班次已过，立即补跑
  const afterNoon = new Date(offset(2026, 10, 20, 12, 16))
  assert.equal(millisecondsUntilFirstWechatAlbumRun(afterNoon), 0)

  // 12:16 之后的下一个班次是次日 00:15
  assert.equal(millisecondsUntilNextWechatAlbumRun(afterNoon), 11 * 60 * 60 * 1000 + 59 * 60 * 1000)

  // 00:10 → 距离 00:15 还有 5 分钟
  const beforeMidnight = new Date(offset(2026, 10, 21, 0, 10))
  assert.equal(millisecondsUntilFirstWechatAlbumRun(beforeMidnight), 5 * 60_000)
})

test('daily run ledger uses the Shanghai calendar date', () => {
  assert.equal(wechatShanghaiDateKey(new Date('2026-10-19T16:30:00.000Z')), '2026-10-20')
})

test('deployment full import is scheduled for the next whole minute', () => {
  const afterDeployment = new Date(offset(2026, 10, 20, 12, 4) + 32_500)
  assert.equal(millisecondsUntilNextWechatAlbumMinute(afterDeployment), 27_500)
  assert.equal(millisecondsUntilNextWechatAlbumMinute(new Date(offset(2026, 10, 20, 12, 5))), 60_000)
})
