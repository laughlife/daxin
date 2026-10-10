// 后台配置相关表的现状核对，供 Task 7/8 判断需要哪些表单。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

const tables = [
  'site_settings', 'service_sections', 'service_items', 'footer_services', 'footer_links',
  'contact_channels', 'qr_assets', 'articles', 'article_categories', 'article_images',
  'cases', 'brands', 'law_firms', 'ip_types', 'media_assets', 'migration_review_items',
  'case_progress', 'case_related_cases', 'admin_users', 'admin_roles',
]

console.log('表名\t行数')
for (const table of tables) {
  const rows = await queryRows(target, `SELECT COUNT(*) FROM \`${table}\``)
  console.log(`${table}\t${rows[0]?.[0] ?? '?'}`)
}

console.log('\n== migration_review_items 待处理分布 ==')
const review = await queryRows(target, `SELECT entity_type, field_name, status, COUNT(*) AS n FROM migration_review_items GROUP BY entity_type, field_name, status ORDER BY n DESC`)
for (const row of review) console.log(`  ${row[0]} / ${row[1]} / ${row[2]}: ${row[3]}`)

console.log('\n== 文章分类 ==')
const categories = await queryRows(target, `SELECT id, slug, name, section, sort_order FROM article_categories ORDER BY sort_order`)
for (const row of categories) console.log(`  ${row[0]}\t${row[1]}\t${row[2]}\t${row[3]}`)

console.log('\n== 案件进度 / 关联案件 ==')
const progress = await queryRows(target, `SELECT COUNT(*) FROM case_progress`)
const related = await queryRows(target, `SELECT COUNT(*) FROM case_related_cases`)
console.log(`  case_progress: ${progress[0]?.[0]}`)
console.log(`  case_related_cases: ${related[0]?.[0]}`)
