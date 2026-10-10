// 清理 Task 7 验收留下的临时数据（只清理验收产生的行，不动真实内容）。
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exit(2)
}

const articles = await queryRows(target, `
SELECT id, slug, title, status FROM articles WHERE title LIKE '%验收临时%'`)
console.log('验收产生的文章：')
for (const row of articles) console.log(`  id=${row[0]} slug=${row[1]} status=${row[3]} title=${row[2]}`)

const review = await queryRows(target, `
SELECT id, status, resolution_note, resolved_by, resolved_at FROM migration_review_items WHERE resolution_note LIKE '%验收临时%'`)
console.log('验收误改的核验项：')
for (const row of review) console.log(`  id=${row[0]} status=${row[1]} note=${row[2]} by=${row[3]}`)

// 1) 删除验收创建的草稿文章（它是本次验收凭空创建的行，不属于迁移数据，可以物理删除）
for (const row of articles) {
  if (String(row[1]).includes('yanshou') || String(row[2]).includes('验收临时')) {
    await executeSql(target, `DELETE FROM articles WHERE id = ${Number(row[0])}`)
    console.log(`  已删除验收文章 id=${row[0]}`)
  }
}

// 2) 把被验收误置为 rejected 的核验项恢复为待处理
for (const row of review) {
  await executeSql(target, `UPDATE migration_review_items
SET status = 'open', resolution_note = '', resolved_by = NULL, resolved_at = NULL, updated_at = NOW()
WHERE id = ${Number(row[0])}`)
  console.log(`  已恢复核验项 id=${row[0]} 为 open`)
}

const after = await queryRows(target, `
SELECT (SELECT COUNT(*) FROM articles WHERE title LIKE '%验收临时%') AS temp_articles,
       (SELECT COUNT(*) FROM migration_review_items WHERE status = 'open') AS open_review,
       (SELECT COUNT(*) FROM articles WHERE status = 'archived') AS archived_articles`)
console.log(`\n清理后：验收文章 ${after[0][0]}，待处理核验项 ${after[0][1]}，已归档文章 ${after[0][2]}`)
