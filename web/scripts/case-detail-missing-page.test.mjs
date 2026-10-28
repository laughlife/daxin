// 详情抓取的页面分类：源站「未查询到案件号」页必须算「无此案件」，不能算滑块拦截，
// 否则连续几条不存在的案件就会触发「连续 3 条被拦，停止本次运行」。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const [tool, server] = await Promise.all([
  readFile(new URL('../../tools/fetch-case-details.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../server/utils/worldtro/detail.ts', import.meta.url), 'utf8'),
])

for (const [name, source] of [['tools/fetch-case-details.mjs', tool], ['server/utils/worldtro/detail.ts', server]]) {
  test(`${name}：未查询到案件的页面归为缺失，不计入连续拦截`, () => {
    assert.match(source, /未查询到案件/, '缺口缺失文案')
    // 判定函数里必须先排除「无此案件」页，再按体积判滑块
    const blockFn = name.includes('tools') ? /function detectBlock[\s\S]*?\n}/ : /function isBlocked[\s\S]*?\n}/
    const blockSource = source.match(blockFn)?.[0] ?? ''
    assert.match(blockSource, /未查询到案件|isUnavailableCase/, '拦截判定未排除无此案件页')
    const missingFn = name.includes('tools') ? /function detectMissing[\s\S]*?\n}/ : /function isMissing[\s\S]*?\n}/
    const missingSource = source.match(missingFn)?.[0] ?? ''
    assert.match(missingSource, /未查询到案件|isUnavailableCase/, '缺失判定未包含无此案件页')
  })
}

test('连续拦截的停止阈值保持 3，只对真正的滑块验证生效', () => {
  assert.match(tool, /consecutiveBlocked >= 3/)
  assert.match(server, /consecutiveBlocked >= 3/)
})
