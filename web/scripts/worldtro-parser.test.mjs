import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRobotsRules, parseWorldTroCasePage, parseWorldTroCases } from '../server/utils/worldtro/parser.mjs'

const listing = `<!doctype html><html><body><table>
  <tr><th>日期</th><th>案件号</th><th>原告</th><th>州</th><th>原告律所</th><th>原告品牌</th><th>类型</th></tr>
  <tr><td>10/17/2026</td><td><a href="/case-IL-2026-cv-12723.html">2026-cv-12723</a></td><td>Christian Dior, S.A.</td><td>IL</td><td>Kossofipr</td><td>Dior 迪奥</td><td>商标</td></tr>
  <tr><td>2026-10-16</td><td><a href="https://worldtro.com/case-IL-2026-cv-12658.html">2026-cv-12658 (被告名单)</a></td><td>Monster Energy Company</td><td>IL</td><td>GBC</td><td>Monster Energy</td><td>版权</td></tr>
  <tr><td>invalid</td><td>2026-cv-00000</td><td>Incomplete</td><td>IL</td><td></td><td></td><td>商标</td></tr>
</table></body></html>`

test('parses the seven public WorldTRO case columns and detail links', () => {
  const rows = parseWorldTroCases(listing)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    caseNumber: '2026-cv-12723',
    filedAt: '2026-10-17',
    plaintiff: 'Christian Dior, S.A.',
    stateCode: 'IL',
    lawFirm: 'Kossofipr',
    brand: 'Dior 迪奥',
    ipType: '商标',
    sourceUrl: 'https://worldtro.com/case-IL-2026-cv-12723.html',
  })
  assert.equal(rows[1].sourceUrl, 'https://worldtro.com/case-IL-2026-cv-12658.html')
  assert.equal(parseWorldTroCasePage(listing).rejectedCount, 1)
})

test('discovers only same-list pagination links and never follows a case detail link', () => {
  const page = listing.replace('</table>', '</table><nav class="pagination"><a href="/tro/?page=2">下一页</a></nav>')
  const parsed = parseWorldTroCasePage(page, 'https://worldtro.com/tro')
  assert.equal(parsed.nextPageUrl, 'https://worldtro.com/tro/?page=2')
  const detailOnly = listing.replace('</table>', '</table><a href="/case-IL-2026-cv-00001.html">下一页</a>')
  assert.equal(parseWorldTroCasePage(detailOnly).nextPageUrl, '')
})

test('fails closed when the expected table is absent or source URL leaves WorldTRO', () => {
  assert.throws(() => parseWorldTroCases(`<html><body>${'blocked '.repeat(20)}</body></html>`), /未找到符合预期字段/)
  const externalLink = listing.replace('/case-IL-2026-cv-12723.html', 'https://outside.example/case.html')
  assert.equal(parseWorldTroCases(externalLink)[0].sourceUrl, '')
})

test('honors user-agent-specific robots allow/disallow rules and crawl-delay', () => {
  const rules = parseRobotsRules(`User-agent: *\nDisallow: /private\n\nUser-agent: DaxinCaseImporter\nDisallow: /tro\nAllow: /tro/public\nCrawl-delay: 4`)
  assert.equal(rules.allowed('https://worldtro.com/private'), true)
  assert.equal(rules.allowed('https://worldtro.com/tro'), false)
  assert.equal(rules.allowed('https://worldtro.com/tro/public'), true)
  assert.equal(rules.crawlDelayMs, 4000)
})
