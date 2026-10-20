// 抽样检查封面 OSS 对象可达性：迁移后图片不能裂。
// 用法：node tools/check-cover-urls.mjs [样本数]
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const sampleSize = Number(process.argv[2] ?? 40)
const target = resolveTargetConnection()

// 均匀抽样：按 id 取模取样，覆盖全部 id 区间，而不是只取最新几条
const urls = await queryRows(target,
  `SELECT m.public_url
     FROM articles a
     JOIN media_assets m ON m.id = a.cover_media_id
    WHERE a.cover_media_id IS NOT NULL
      AND m.public_url <> ''
    ORDER BY a.id
    LIMIT ${sampleSize * 20}`)

const picked = []
const step = Math.max(1, Math.floor(urls.length / sampleSize))
for (let i = 0; i < urls.length && picked.length < sampleSize; i += step) {
  picked.push(urls[i][0])
}

console.log(`样本 ${picked.length} 张（候选 ${urls.length} 个）`)

let ok = 0
const bad = []
const concurrency = 8
for (let i = 0; i < picked.length; i += concurrency) {
  const batch = picked.slice(i, i + concurrency)
  const results = await Promise.all(batch.map(async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
      return { url, status: res.status }
    } catch (error) {
      return { url, status: `ERR ${error.message}` }
    }
  }))
  for (const r of results) {
    if (r.status === 200) ok += 1
    else bad.push(r)
  }
}

console.log(`HTTP 200：${ok}/${picked.length}`)
if (bad.length) {
  console.log('异常：')
  for (const r of bad.slice(0, 10)) console.log(`  ${r.status}  ${r.url}`)
  process.exitCode = 1
} else {
  console.log('全部可访问')
}
