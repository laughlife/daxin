import assert from 'node:assert/strict'
import test from 'node:test'
import {
  millisecondsUntilFirstWechatAlbumRun,
  millisecondsUntilNextWechatAlbumRun,
  wechatShanghaiDateKey,
} from '../server/utils/wechat-album/schedule.mjs'

const offset = (year, month, day, hour, minute) => Date.UTC(year, month - 1, day, hour - 8, minute)

test('daily job runs at 12:15 Shanghai time and catches up when the process starts later', () => {
  const before = new Date(offset(2026, 10, 20, 12, 14))
  const after = new Date(offset(2026, 10, 20, 12, 16))
  assert.equal(millisecondsUntilFirstWechatAlbumRun(before), 60_000)
  assert.equal(millisecondsUntilFirstWechatAlbumRun(after), 0)
  assert.equal(millisecondsUntilNextWechatAlbumRun(after), 23 * 60 * 60 * 1000 + 59 * 60 * 1000)
})

test('daily run ledger uses the Shanghai calendar date', () => {
  assert.equal(wechatShanghaiDateKey(new Date('2026-10-19T16:30:00.000Z')), '2026-10-20')
})
