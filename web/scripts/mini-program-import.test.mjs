// 小程序采集的详情抓取策略：默认滚动刷新 1/4；WX_DETAIL_SLICE=0 时只在列表字段变化时抓详情。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const importer = await readFile(new URL('../../tools/import-mini-program.mjs', import.meta.url), 'utf8')

test('滚动刷新默认每班 1/4，允许用 WX_DETAIL_SLICE=0 关闭', () => {
  assert.match(importer, /const rawSlice = Number\(env\.WX_DETAIL_SLICE \?\? 4\)/)
  assert.match(importer, /const DETAIL_SLICE = Number\.isFinite\(rawSlice\) \? Math\.max\(0, Math\.floor\(rawSlice\)\) : 4/)
  // 切片序号不能对 0 取模
  assert.match(importer, /DETAIL_SLICE > 0\s*\n?\s*\?/)
  // 关闭滚动刷新：列表哈希没变就不抓详情
  assert.match(importer, /if \(DETAIL_SLICE === 0\) return false/)
})
