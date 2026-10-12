// 输出两个 JSON 类配置的完整可读内容，便于人工核对清单。
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()

async function valueOf(key) {
  const rows = await queryRows(target, `SELECT setting_value FROM site_settings WHERE is_current = 1 AND setting_key = '${key}'`)
  return rows[0]?.[0] ?? ''
}

console.log('=== home_stats（数据概览）===')
try {
  const stats = JSON.parse(await valueOf('home_stats'))
  for (const item of stats) {
    console.log(`  ${String(item.value).padEnd(10)} | ${String(item.label).padEnd(12)} | ${item.description}`)
  }
} catch (error) {
  console.log(`  解析失败：${error.message}`)
}

console.log('\n=== about_team_paragraphs（团队介绍段落）===')
try {
  const paragraphs = JSON.parse(await valueOf('about_team_paragraphs'))
  console.log(`  共 ${paragraphs.length} 段`)
  paragraphs.forEach((text, index) => {
    const brief = String(text)
    console.log(`  ${index + 1}. ${brief.length > 70 ? `${brief.slice(0, 70)}…` : brief}`)
  })
} catch (error) {
  console.log(`  解析失败：${error.message}`)
}

console.log('\n=== 多图字段张数 ===')
for (const key of ['about_hero_image', 'about_business_images', 'about_success_images',
  'about_lecture_images', 'about_partner_images', 'about_honors_images']) {
  try {
    const list = JSON.parse(await valueOf(key))
    console.log(`  ${key.padEnd(26)} ${Array.isArray(list) ? list.length : '?'} 张`)
  } catch {
    console.log(`  ${key.padEnd(26)} 解析失败`)
  }
}
