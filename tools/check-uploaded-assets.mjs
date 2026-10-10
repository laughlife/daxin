import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()

const summary = await queryRows(target, `
SELECT COUNT(*) AS n, MIN(id) AS min_id, MAX(id) AS max_id
FROM media_assets WHERE legacy_source_table = 'legacy-site'`)
console.log(`legacy-site 素材：${summary[0][0]} 行，id ${summary[0][1]}–${summary[0][2]}`)

console.log('\n关键素材：')
const keys = await queryRows(target, `
SELECT id, title, width, height, LEFT(public_url, 80) AS url
FROM media_assets
WHERE legacy_source_table = 'legacy-site'
  AND (title LIKE '%logo-daxin%' OR title LIKE '%bb92730699e638d%' OR title LIKE '%c5dfa0bb4dca4%')
ORDER BY id`)
for (const row of keys) {
  console.log(`  id=${row[0]} ${row[1]} ${row[2]}x${row[3]}`)
  console.log(`     ${row[4]}`)
}

console.log('\nsite_settings 里的图片类配置：')
const settings = await queryRows(target, `
SELECT setting_key, value_type, media_id, LEFT(setting_value, 60) AS value
FROM site_settings WHERE is_current = 1 AND (value_type = 'image' OR media_id IS NOT NULL)
ORDER BY setting_key`)
for (const row of settings) {
  console.log(`  ${String(row[0]).padEnd(24)} type=${row[1]} media_id=${row[2]} value=${row[3]}`)
}
