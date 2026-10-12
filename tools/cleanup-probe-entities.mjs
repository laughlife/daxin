// 清理交互验证脚本留下的探针品牌与探针律所。
//
// verify-admin-interactions.mjs 会真实调用「用输入名称新建品牌/律所」，
// 因而在 brands / law_firms 表留下 测试品牌* / 测试律所* 记录。
// 本脚本把它们连同可能存在的关联一并删除，避免污染数据。
//
// 用法：node tools/cleanup-probe-entities.mjs [--dry-run]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const dryRun = process.argv.includes('--dry-run')
const target = resolveTargetConnection()

/** 清理一张表里的探针记录。 */
async function clean(table, namePattern, relationTable, relationColumn, label) {
  const rows = await queryRows(target, `
    SELECT id, slug, name FROM ${table} WHERE name LIKE '${namePattern}'`)
  if (rows.length === 0) {
    console.log(`${label}: 没有探针记录`)
  } else {
    console.log(`${label}: 找到 ${rows.length} 条`)
    for (const [id, slug, name] of rows) {
      console.log(`  id=${id} slug=${slug} name=${name}`)
      if (dryRun) continue
      await executeSql(target, `DELETE FROM ${relationTable} WHERE ${relationColumn} = ${Number(id)}`)
      await executeSql(target, `DELETE FROM ${table} WHERE id = ${Number(id)}`)
    }
    if (!dryRun) console.log(`  已删除${label}探针及其关联`)
  }
}

await clean('brands', '测试品牌%', 'case_brands', 'brand_id', '品牌')
await clean('law_firms', '测试律所%', 'case_law_firms', 'law_firm_id', '律所')

if (dryRun) console.log('\n[dry-run] 未做任何修改')

const leftoverBrands = await queryRows(target, `SELECT COUNT(*) FROM brands WHERE name LIKE '测试品牌%'`)
const leftoverFirms = await queryRows(target, `SELECT COUNT(*) FROM law_firms WHERE name LIKE '测试律所%'`)
const totalBrands = await queryRows(target, `SELECT COUNT(*) FROM brands`)
const totalFirms = await queryRows(target, `SELECT COUNT(*) FROM law_firms`)
console.log(`\n剩余探针：品牌 ${leftoverBrands[0][0]}，律所 ${leftoverFirms[0][0]}`)
console.log(`总数：品牌 ${totalBrands[0][0]}，律所 ${totalFirms[0][0]}`)
