// 只读核对：关于我们配置与页脚可点击性。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

console.log('== 页脚业务项可点击性 ==')
const services = await queryRows(target, 'SELECT title, link_path FROM footer_services ORDER BY sort_order')
const emptyServices = services.filter((row) => !row[1])
console.log(`  共 ${services.length} 项，link_path 为空：${emptyServices.length}`)
for (const row of services) console.log(`    ${String(row[0]).padEnd(26)} -> ${row[1] || '(空，不可点击)'}`)

console.log('\n== 页脚导航链接 ==')
const links = await queryRows(target, 'SELECT title, link_path FROM footer_links ORDER BY sort_order')
console.log(`  共 ${links.length} 项，link_path 为空：${links.filter((row) => !row[1]).length}`)

console.log('\n== 关于我们配置（about 组，is_current=1）==')
const about = await queryRows(target, `
SELECT setting_key, CHAR_LENGTH(setting_value) AS len, value_type
FROM site_settings WHERE setting_group = 'about' AND is_current = 1 ORDER BY setting_key`)
console.log(`  共 ${about.length} 条：`)
for (const row of about) console.log(`    ${String(row[0]).padEnd(28)} 长度=${String(row[1]).padStart(5)} 类型=${row[2]}`)

console.log('\n== 首页配置（home 组）==')
const home = await queryRows(target, `
SELECT COUNT(*) FROM site_settings WHERE setting_group = 'home' AND is_current = 1`)
console.log(`  共 ${home[0][0]} 条`)

console.log('\n== site_settings 不变式：每个 key 恰好一行 is_current=1 ==')
const invariant = await queryRows(target, `
SELECT COUNT(*) FROM (SELECT setting_key FROM site_settings WHERE is_current = 1 GROUP BY setting_key HAVING COUNT(*) > 1) t`)
console.log(`  违反不变式的 key 数：${invariant[0][0]}（应为 0）`)

console.log('\n== 文章分类内容量（用于「案例四类各三条」）==')
const categories = await queryRows(target, `
SELECT ac.slug, ac.name, COUNT(a.id) AS n
FROM article_categories ac
LEFT JOIN articles a ON a.category_id = ac.id AND a.status = 'published'
GROUP BY ac.slug, ac.name ORDER BY ac.sort_order`)
for (const row of categories) console.log(`    ${String(row[0]).padEnd(14)} ${String(row[1]).padEnd(16)} ${row[2]} 篇`)
