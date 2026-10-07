import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampPage, shanghaiDate, isWithinDays, inDateRange } from '../app/utils/content.ts'

test('分页限制在有效范围，拒绝零、负数、小数、无穷和非法值', () => {
  for (const [input, expected] of [[999, 3], [4, 3], [0, 1], [-1, 1], [2.5, 1], ['abc', 1], [Infinity, 1], [2, 2]]) {
    assert.equal(clampPage(input, 3), expected)
  }
  assert.equal(clampPage(999, 0), 1)
})
test('北京时间自然日最近三天，排除未来及非法日期', () => {
  const now = new Date('2026-10-06T16:30:00Z')
  assert.equal(shanghaiDate(now), '2026-10-07')
  for (const day of ['2026-10-07', '2026-10-06', '2026-10-05']) assert.equal(isWithinDays(day, 3, now), true)
  for (const day of ['2026-10-04', '2026-10-08', '2026-02-30', 'garbage']) assert.equal(isWithinDays(day, 3, now), false)
})
test('日期范围含首尾，反向范围及非法日期不匹配', () => {
  assert.equal(inDateRange('2025-09-28', '2025-09-28', '2025-09-28'), true)
  assert.equal(inDateRange('2025-09-28', '', ''), true)
  assert.equal(inDateRange('2025-09-28', '2025-09-29', ''), false)
  assert.equal(inDateRange('2025-09-28', '2025-10-01', '2025-09-01'), false)
  assert.equal(inDateRange('2025-09-28', 'invalid', ''), false)
})
