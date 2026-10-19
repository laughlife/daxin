import assert from 'node:assert/strict'
import test from 'node:test'
import { crawlWorldTroList } from '../server/utils/worldtro/crawler.mjs'
import { millisecondsUntilNextWorldTroRun, shanghaiDateKey } from '../server/utils/worldtro/schedule.mjs'

const page = (caseNumber, next = '') => `<!doctype html><html><body><table>
<tr><th>日期</th><th>案件号</th><th>原告</th><th>州</th><th>原告律所</th><th>原告品牌</th><th>类型</th></tr>
<tr><td>10/17/2026</td><td><a href="/case-${caseNumber}.html">${caseNumber}</a></td><td>Plaintiff</td><td>IL</td><td>Firm</td><td>Brand</td><td>商标</td></tr>
</table>${next}</body></html>`

test('first import walks every same-list page and deduplicates case numbers without fetching detail links', async () => {
  const first = page('2026-cv-00100', '<nav class="pagination"><a href="/tro/?page=2">下一页</a></nav>')
  const second = page('2026-cv-00099')
  const requests = []
  const result = await crawlWorldTroList({
    initialImport: true,
    fetchPage: async (url) => {
      requests.push(url)
      return url.endsWith('page=2') ? second : first
    },
    sleep: async () => {},
  })
  assert.equal(result.pageCount, 2)
  assert.deepEqual(result.cases.map((item) => item.caseNumber), ['2026-cv-00100', '2026-cv-00099'])
  assert.deepEqual(requests, ['https://worldtro.com/tro', 'https://worldtro.com/tro/?page=2'])
})

test('daily run reads only newest page and stops at the first known case', async () => {
  const html = page('2026-cv-00100', '<nav class="pagination"><a href="/tro/?page=2">下一页</a></nav>')
  const requests = []
  const result = await crawlWorldTroList({
    fetchPage: async (url) => { requests.push(url); return html },
    knownCaseNumbers: ['2026-cv-00100'],
    sleep: async () => {},
  })
  assert.equal(result.stoppedAtKnown, true)
  assert.equal(result.cases.length, 0)
  assert.deepEqual(requests, ['https://worldtro.com/tro'])
})

test('daily run includes only new rows before the first known case', async () => {
  const html = page('2026-cv-00101').replace('</table>', '<tr><td>10/16/2026</td><td>2026-cv-00100</td><td>Plaintiff</td><td>IL</td><td>Firm</td><td>Brand</td><td>商标</td></tr></table>')
  const result = await crawlWorldTroList({
    fetchPage: async () => html,
    knownCaseNumbers: ['2026-cv-00100'],
    sleep: async () => {},
  })
  assert.deepEqual(result.cases.map((item) => item.caseNumber), ['2026-cv-00101'])
  assert.equal(result.stoppedAtKnown, true)
})

test('scheduler uses China time and starts after noon each day', () => {
  const beforeNoon = new Date('2026-10-19T03:00:00.000Z') // 11:00 in Shanghai
  const atOnePm = new Date('2026-10-19T05:00:00.000Z') // 13:00 in Shanghai
  assert.equal(shanghaiDateKey(beforeNoon), '2026-10-19')
  assert.equal(millisecondsUntilNextWorldTroRun(beforeNoon), 75 * 60 * 1000)
  assert.equal(millisecondsUntilNextWorldTroRun(atOnePm), 23 * 60 * 60 * 1000 + 15 * 60 * 1000)
})
