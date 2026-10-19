import { parseWorldTroCasePage } from './parser.mjs'

const DEFAULT_START_URL = 'https://worldtro.com/tro'

/**
 * 遍历公开案件列表页。initialImport 会沿同一列表的分页链接完整采集；日常模式只读第一页，
 * 并在按时间倒序的列表中遇到已知案件号后停止。不会访问案件详情链接。
 * @param {{ fetchPage: (url: string) => Promise<string>, initialImport?: boolean, knownCaseNumbers?: Iterable<string>, startUrl?: string, maxPages?: number, pageDelayMs?: number, sleep?: (ms: number) => Promise<void> }} options
 */
export async function crawlWorldTroList({
  fetchPage,
  initialImport = false,
  knownCaseNumbers = [],
  startUrl = DEFAULT_START_URL,
  maxPages = 500,
  pageDelayMs = 1500,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const known = new Set([...knownCaseNumbers].map((value) => String(value).trim().toLowerCase()))
  const visitedPages = new Set()
  const seenCases = new Set()
  const cases = []
  let currentUrl = startUrl
  let pageCount = 0
  let duplicateCount = 0
  let stoppedAtKnown = false

  while (currentUrl) {
    if (visitedPages.has(currentUrl)) throw new Error('WorldTRO 列表分页出现循环，本次全量采集已终止')
    if (pageCount >= maxPages) throw new Error(`WorldTRO 列表超过 ${maxPages} 页，无法确认是否完整，本次全量采集已终止`)
    visitedPages.add(currentUrl)
    const html = await fetchPage(currentUrl)
    const page = parseWorldTroCasePage(html, currentUrl)
    pageCount += 1

    for (const item of page.cases) {
      const key = item.caseNumber.trim().toLowerCase()
      if (!initialImport && known.has(key)) {
        stoppedAtKnown = true
        break
      }
      if (seenCases.has(key)) {
        duplicateCount += 1
        continue
      }
      seenCases.add(key)
      cases.push(item)
    }
    if (!initialImport || stoppedAtKnown || !page.nextPageUrl) break
    if (visitedPages.has(page.nextPageUrl)) throw new Error('WorldTRO 列表分页链接返回已访问页面，本次全量采集已终止')
    await sleep(pageDelayMs)
    currentUrl = page.nextPageUrl
  }

  if (!cases.length && initialImport) throw new Error('WorldTRO 列表没有可导入的有效案件号，本次未修改案件数据')
  return { cases, pageCount, duplicateCount, stoppedAtKnown }
}
