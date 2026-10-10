// 下载旧站素材到本地暂存目录，供后续上传 OSS 与写入配置表使用。
//
// 只下载 `/about` 页面实际引用的图片（团队图、宣讲图、伙伴 logo、公众号/咨询号二维码等）。
// 文件名与 URL 的对应关系写入 manifest.json，便于回溯来源。
//
// 用法：node tools/download-legacy-assets.mjs [输出目录]
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const outDir = process.argv[2] ?? 'D:\\AppData\\legacy-assets'
mkdirSync(outDir, { recursive: true })

const PAGES = ['http://yan1.qinianyun.com/about/']

/** 需要排除的：需求要求删除的大礼包区域图片，以及首页 hero 背景。 */
const SKIP_PATTERNS = [/4aba078c46eea/]

const urls = new Set()
for (const page of PAGES) {
  const response = await fetch(page, { signal: AbortSignal.timeout(60000) })
  const html = await response.text()
  for (const match of html.matchAll(/https?:\/\/yan1\.qinianyun\.com\/wp-content\/uploads\/[^"')>\s]+?\.(?:jpg|jpeg|png|webp)/gi)) {
    const url = match[0]
    if (SKIP_PATTERNS.some((pattern) => pattern.test(url))) continue
    urls.add(url)
  }
}

console.log(`找到 ${urls.size} 个图片 URL`)

const manifest = []
for (const url of urls) {
  // URL 里的中文文件名需要解码后再作为本地文件名
  const decoded = decodeURIComponent(basename(url))
  const safeName = decoded.replace(/[\\/:*?"<>|]/g, '_')
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) {
      console.log(`  ✖ ${response.status} ${url}`)
      manifest.push({ url, file: safeName, ok: false, status: response.status })
      continue
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    writeFileSync(join(outDir, safeName), bytes)
    console.log(`  ✔ ${safeName}  ${Math.round(bytes.length / 1024)}KB`)
    manifest.push({ url, file: safeName, ok: true, bytes: bytes.length })
  } catch (error) {
    console.log(`  ✖ ${url} — ${error.message}`)
    manifest.push({ url, file: safeName, ok: false, error: error.message })
  }
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
const ok = manifest.filter((item) => item.ok).length
console.log(`\n完成：${ok}/${manifest.length} 下载成功，目录 ${outDir}`)
