// 回填结果核对：只读统计 + 公网抽样。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

async function scalar(sql) {
  const rows = await queryRows(target, sql)
  return rows[0]?.[0] ?? ''
}

console.log('== media_assets ==')
console.log(await queryRows(target, `SELECT COUNT(*) AS total, SUM(public_url <> '') AS with_url, SUM(byte_size > 0) AS with_size, SUM(width IS NOT NULL) AS with_dims FROM media_assets`).then((r) => r.map((x) => x.join('\t')).join('\n')))

console.log('\n== articles 正文改写 ==')
console.log('仍含 src="res/ 的文章数：' + await scalar(`SELECT COUNT(*) FROM articles WHERE content_html LIKE '%src="res/%'`))
console.log('含 OSS 地址的文章数：' + await scalar(`SELECT COUNT(*) FROM articles WHERE content_html LIKE '%aliyuncs.com%'`))
console.log('已发布文章数：' + await scalar(`SELECT COUNT(*) FROM articles WHERE status = 'published'`))
console.log('正文仍含任意 res/ 的文章数：' + await scalar(`SELECT COUNT(*) FROM articles WHERE content_html LIKE '%res/%'`))

console.log('\n== article_images 关联 ==')
console.log('总关联行：' + await scalar(`SELECT COUNT(*) FROM article_images`))
console.log('已关联到有 public_url 媒体的行数：' + await scalar(`SELECT COUNT(*) FROM article_images ai JOIN media_assets m ON m.id = ai.media_id WHERE m.public_url <> ''`))

console.log('\n== 公网抽样（4 张随机图片）==')
const samples = await queryRows(target, `SELECT public_url FROM media_assets WHERE public_url <> '' ORDER BY RAND() LIMIT 4`)
for (const [url] of samples) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
    console.log(`  HTTP ${response.status} ${response.headers.get('content-type') ?? ''} ${response.headers.get('content-length') ?? ''} ${url}`)
  } catch (error) {
    console.log(`  失败 ${error.message} ${url}`)
  }
}

console.log('\n== 抽查一篇被改写的文章正文片段 ==')
const [row] = await queryRows(target, `SELECT id, SUBSTRING(content_html, GREATEST(1, LOCATE('aliyuncs.com', content_html) - 90), 240) FROM articles WHERE content_html LIKE '%aliyuncs.com%' ORDER BY id LIMIT 1`)
if (row) {
  console.log('文章 id=' + row[0])
  console.log(String(row[1]).replace(/\s+/g, ' '))
} else {
  console.log('（未找到含 OSS 地址的正文）')
}
