// 将已导入 daxin 的 dxfw 文章切换到官网当前栏目。
// 默认只读 dry-run；仅显式传入 --apply 才会在 daxin 中更新分类。
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { executeSql, queryObjects, quoteLiteral, resolveLegacyConnection, resolveTargetConnection } from './mysql-client.mjs'
import { fetchLegacyArticles } from './legacy-source.mjs'
import { ARTICLE_CATEGORY_ROWS, RETIRED_ARTICLE_CATEGORY_SLUGS } from './legacy-import.mjs'

export const EXPECTED_DXFW_ARTICLE_COUNT = 858

const TARGET_ARTICLES_SQL = `SELECT a.id, a.legacy_source_table, a.legacy_source_id,
  c.slug AS current_slug
FROM articles a
LEFT JOIN article_categories c ON c.id = a.category_id
WHERE a.legacy_source_table = 'dr_1_news'
ORDER BY a.id`

/** 纯函数：按 dxfw 来源 ID 生成目标库分类更新清单。 */
export function buildReclassificationPlan({ sourceArticles = [], targetArticles = [], expectedCount = EXPECTED_DXFW_ARTICLE_COUNT } = {}) {
  const sourceRows = sourceArticles.filter((row) => row.legacy_source_table === 'dr_1_news')
  const targetRows = targetArticles.filter((row) => row.legacy_source_table === 'dr_1_news')
  const sourceById = new Map()
  const duplicateSourceIds = []

  for (const row of sourceRows) {
    const id = String(row.legacy_source_id ?? '')
    if (!id) continue
    if (sourceById.has(id)) duplicateSourceIds.push(id)
    sourceById.set(id, row)
  }

  const updates = []
  const missingSourceIds = []
  const unmappedSourceIds = []
  const beforeCounts = {}
  const afterCounts = {}

  for (const row of targetRows) {
    const sourceId = String(row.legacy_source_id ?? '')
    const source = sourceById.get(sourceId)
    const currentSlug = String(row.current_slug ?? '') || '(未分类)'
    beforeCounts[currentSlug] = (beforeCounts[currentSlug] ?? 0) + 1

    if (!source) {
      missingSourceIds.push(sourceId || '(empty)')
      continue
    }
    const categorySlug = String(source.categorySlug ?? '')
    if (!categorySlug) {
      unmappedSourceIds.push(sourceId)
      continue
    }
    afterCounts[categorySlug] = (afterCounts[categorySlug] ?? 0) + 1
    if (currentSlug !== categorySlug) {
      updates.push({ articleId: Number(row.id) || 0, legacySourceId: sourceId, categorySlug })
    }
  }

  const canApply = sourceRows.length === expectedCount
    && targetRows.length === expectedCount
    && missingSourceIds.length === 0
    && unmappedSourceIds.length === 0
    && duplicateSourceIds.length === 0
    && updates.every((row) => /^\d+$/.test(row.legacySourceId) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(row.categorySlug))

  return {
    sourceCount: sourceRows.length,
    targetCount: targetRows.length,
    beforeCounts,
    afterCounts,
    updates,
    missingSourceIds,
    unmappedSourceIds,
    duplicateSourceIds: [...new Set(duplicateSourceIds)],
    canApply,
  }
}

/** 单条 UPDATE 只改文章分类，并严格限定迁移来源表。 */
export function buildArticleReclassificationSql(updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) return ''
  const safeUpdates = updates.map((row) => {
    const sourceId = String(row.legacySourceId ?? '')
    const slug = String(row.categorySlug ?? '')
    if (!/^\d+$/.test(sourceId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      throw new Error('重分类清单含有无效的来源 ID 或分类 slug')
    }
    return { sourceId, slug }
  })
  const when = safeUpdates.map(({ sourceId, slug }) =>
    `WHEN ${quoteLiteral(sourceId)} THEN (SELECT id FROM article_categories WHERE slug = ${quoteLiteral(slug)} LIMIT 1)`,
  ).join('\n  ')
  const ids = [...new Set(safeUpdates.map(({ sourceId }) => sourceId))].map(quoteLiteral).join(', ')
  return `UPDATE articles
SET category_id = CASE legacy_source_id
  ${when}
  ELSE category_id
END
WHERE legacy_source_table = 'dr_1_news'
  AND legacy_source_id IN (${ids})`
}

function buildCategoryStatements() {
  const statements = ARTICLE_CATEGORY_ROWS.map((category) => `INSERT INTO article_categories
  (slug, name, section, sort_order, status)
VALUES
  (${quoteLiteral(category.slug)}, ${quoteLiteral(category.name)}, ${quoteLiteral(category.section)}, ${category.sort}, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), section = VALUES(section), sort_order = VALUES(sort_order), status = 1`)
  const retired = RETIRED_ARTICLE_CATEGORY_SLUGS.map(quoteLiteral).join(', ')
  statements.push(`UPDATE article_categories SET status = 0 WHERE slug IN (${retired})`)
  return statements
}

async function run() {
  const args = new Set(process.argv.slice(2))
  for (const arg of args) {
    if (!['--dry-run', '--apply'].includes(arg)) throw new Error(`未知参数：${arg}`)
  }
  if (args.has('--dry-run') && args.has('--apply')) throw new Error('不能同时指定 --dry-run 与 --apply')
  const apply = args.has('--apply')
  const legacy = resolveLegacyConnection()
  const target = resolveTargetConnection()
  if (!legacy || !target) throw new Error('数据库连接配置不可用')
  legacy.database = 'dxfw'
  if (target.database !== 'daxin') throw new Error(`拒绝写入目标库 ${target.database}；本脚本只允许 daxin`)

  const [sourceArticles, targetArticles] = await Promise.all([
    fetchLegacyArticles(legacy, { includeUnmapped: true }),
    queryObjects(target, TARGET_ARTICLES_SQL),
  ])
  const plan = buildReclassificationPlan({ sourceArticles, targetArticles })
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    sourceCount: plan.sourceCount,
    targetCount: plan.targetCount,
    beforeCounts: plan.beforeCounts,
    afterCounts: plan.afterCounts,
    updates: plan.updates.length,
    missingSourceIds: plan.missingSourceIds,
    unmappedSourceIds: plan.unmappedSourceIds,
    duplicateSourceIds: plan.duplicateSourceIds,
    canApply: plan.canApply,
  }, null, 2))

  if (!apply) return
  if (!plan.canApply) throw new Error('数据数量或映射校验未通过，目标库未修改')

  const statements = buildCategoryStatements()
  const articleSql = buildArticleReclassificationSql(plan.updates)
  if (articleSql) statements.push(articleSql)
  await executeSql(target, `START TRANSACTION;\n${statements.map((sql) => `${sql};`).join('\n')}\nCOMMIT;\n`)

  const afterRows = await queryObjects(target, TARGET_ARTICLES_SQL)
  const verification = buildReclassificationPlan({ sourceArticles, targetArticles: afterRows })
  if (verification.updates.length > 0 || !verification.canApply) {
    throw new Error('目标库重分类后校验未通过；请检查分类计数')
  }
  console.log(JSON.stringify({ verified: true, articleCount: verification.targetCount, counts: verification.afterCounts }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  run().catch((error) => { console.error(`文章重分类失败：${error.message}`); process.exitCode = 1 })
}
