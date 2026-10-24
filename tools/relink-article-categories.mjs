// 按当前「采集源 → 栏目」映射补齐 article_category_links。
//
// 使用场景：改了 wechat_album_sources.category_slug 之后，
// 已有文章的栏目归属不会自动变化（关联表是快照），需要重跑一次补齐。
//
// 幂等：全部是 INSERT IGNORE，重复执行安全。
//
// 用法：
//   node tools/relink-article-categories.mjs            # 只看将补多少条
//   node tools/relink-article-categories.mjs --apply    # 真正写入
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'
const APPLY = process.argv.includes('--apply')

function query(sql) {
  const out = execFileSync(MYSQL, [
    '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
    '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
    '--execute', `USE daxin; ${sql}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter(Boolean).map((line) => line.split('\t'))
}

// 将要补齐的条数（按源统计，便于核对是哪个源缺）
const pending = query(`
  SELECT s.source_key, s.category_slug, COUNT(DISTINCT i.article_id) AS missing
  FROM wechat_album_items i
  JOIN wechat_album_sources s ON s.id = i.source_id
  JOIN article_categories c ON c.slug = s.category_slug
  LEFT JOIN article_category_links l
    ON l.article_id = i.article_id AND l.category_id = c.id
  WHERE i.article_id IS NOT NULL AND l.article_id IS NULL
  GROUP BY s.id
  ORDER BY missing DESC`)

if (pending.length === 0) {
  console.log('各源均已按映射关联，无需补齐。')
} else {
  console.log('=== 待补齐（按源）===')
  for (const [sourceKey, categorySlug, missing] of pending) {
    console.log(`  ${sourceKey.padEnd(22)} → ${categorySlug.padEnd(14)} 缺 ${missing} 条`)
  }
}

if (!APPLY) {
  console.log('\n（试算模式，未写库。加 --apply 执行。）')
  process.exit(0)
}

// ① 主栏目（保险：老文章可能也没入表）
query(`INSERT IGNORE INTO article_category_links (article_id, category_id)
       SELECT a.id, a.category_id FROM articles a WHERE a.category_id IS NOT NULL`)

// ② 按源映射补齐
query(`INSERT IGNORE INTO article_category_links (article_id, category_id)
       SELECT i.article_id, c.id
       FROM wechat_album_items i
       JOIN wechat_album_sources s ON s.id = i.source_id
       JOIN article_categories c ON c.slug = s.category_slug
       WHERE i.article_id IS NOT NULL`)

// 核对结果
const remaining = query(`
  SELECT COUNT(*) FROM wechat_album_items i
  JOIN wechat_album_sources s ON s.id = i.source_id
  JOIN article_categories c ON c.slug = s.category_slug
  LEFT JOIN article_category_links l
    ON l.article_id = i.article_id AND l.category_id = c.id
  WHERE i.article_id IS NOT NULL AND l.article_id IS NULL`)[0]?.[0] ?? '?'

const perCategory = query(`
  SELECT c.slug, COUNT(l.article_id)
  FROM article_categories c
  LEFT JOIN article_category_links l ON l.category_id = c.id
  GROUP BY c.id HAVING COUNT(l.article_id) > 0
  ORDER BY COUNT(l.article_id) DESC`)

console.log(`\n补齐完成，仍缺 ${remaining} 条。`)
console.log('=== 各栏目可见文章数 ===')
for (const [slug, count] of perCategory) console.log(`  ${slug.padEnd(16)} ${count}`)
