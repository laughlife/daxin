// 清理交互验证脚本留下的探针品牌。
//
// verify-admin-interactions.mjs 会真实调用「用输入名称新建品牌」，
// 因而在 brands 表留下 测试品牌* 记录。本脚本把它们连同可能存在的
// case_brands 关联一并删除，避免污染品牌库。
//
// 用法：node tools/cleanup-probe-brands.mjs [--dry-run]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const dryRun = process.argv.includes('--dry-run')
const target = resolveTargetConnection()

const rows = await queryRows(target, `
  SELECT id, slug, name FROM brands WHERE name LIKE '测试品牌%'`)
if (rows.length === 0) {
  console.log('没有探针品牌需要清理')
} else {
  console.log(`找到 ${rows.length} 个探针品牌：`)
  for (const [id, slug, name] of rows) {
    console.log(`  id=${id} slug=${slug} name=${name}`)
    if (dryRun) continue

    // 先清关联，避免留下指向已删品牌的悬空关系
    await executeSql(target, `DELETE FROM case_brands WHERE brand_id = ${Number(id)}`)
    await executeSql(target, `DELETE FROM brands WHERE id = ${Number(id)}`)
  }
  if (dryRun) console.log('\n[dry-run] 未做任何修改')
  else console.log('\n已删除探针品牌及其关联')
}

const left = await queryRows(target, `SELECT COUNT(*) FROM brands WHERE name LIKE '测试品牌%'`)
console.log(`剩余探针品牌：${left[0][0]}`)
const total = await queryRows(target, `SELECT COUNT(*) FROM brands`)
console.log(`品牌总数：${total[0][0]}`)
