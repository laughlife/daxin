// 抓取旧站首页，列出其中的图片资源，用于挑选可用的 Banner 图。
// 只做只读抓取，不修改任何数据。
import { mkdirSync, writeFileSync } from 'node:fs'

const url = process.argv[2] ?? 'http://yan1.qinianyun.com/'
const outDir = 'tmp/banner-candidates'
mkdirSync(outDir, { recursive: true })

const response = await fetch(url, {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; daxin-migration/1.0)' },
  signal: AbortSignal.timeout(60000),
})
const html = await response.text()
console.log(`抓取 ${url} → HTTP ${response.status}，HTML 长度 ${html.length}`)

// 收集 <img src>、srcset 与 style 里的 background-image
const urls = new Set()
for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.add(match[1])
for (const match of html.matchAll(/<img[^>]+data-src=["']([^"']+)["']/gi)) urls.add(match[1])
for (const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) urls.add(match[1])

const resolved = []
for (const raw of urls) {
  if (!raw || raw.startsWith('data:')) continue
  try {
    const absolute = new URL(raw, url).href
    if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(absolute)) continue
    resolved.push(absolute)
  } catch { /* 跳过非法 URL */ }
}

console.log(`找到 ${resolved.length} 个图片地址`)
for (const item of resolved) console.log(`  ${item}`)

// 下载并记录尺寸，便于判断哪些是横幅
const sharpLike = null
writeFileSync(`${outDir}/urls.txt`, resolved.join('\n'), 'utf8')
console.log(`\n地址已写入 ${outDir}/urls.txt`)
void sharpLike
