// 旧库迁移 CLI：默认只做 dry-run，输出报告，不写任何数据库。
//
// 用法：
//   node tools/migrate-legacy/legacy-migrate.mjs --dry-run [--out <file>] [--include-unmapped]
//   node tools/migrate-legacy/legacy-migrate.mjs --import --batch <batch_key>   # 需先有 dry-run 报告
//
// 安全边界：
//   - 旧库连接只执行 SELECT（见 legacy-source.mjs）；
//   - dry-run 不写目标库；
//   - --import 写入 daxin，使用 migration_batch_id 保证可重复执行不重复导入。
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { resolveLegacyConnection, resolveTargetConnection } from './mysql-client.mjs'
import { parseLegacyArticle } from './legacy-parser.mjs'
import { PROJECT_CATEGORY_MAP, fetchLegacyArticles, fetchLegacyProjectStats, parseResourcePath } from './legacy-source.mjs'
import { importBatch, verifyBatch } from './legacy-import.mjs'

function parseArgs(argv) {
  const options = { dryRun: false, doImport: false, includeUnmapped: false, batch: '', out: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--import') options.doImport = true
    else if (arg === '--include-unmapped') options.includeUnmapped = true
    else if (arg === '--batch') options.batch = argv[++index] ?? ''
    else if (arg.startsWith('--batch=')) options.batch = arg.slice('--batch='.length)
    else if (arg === '--out') options.out = argv[++index] ?? ''
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

const USAGE = `用法：node tools/migrate-legacy/legacy-migrate.mjs <模式> [选项]

模式（必须二选一）：
  --dry-run                 只读取旧库并生成迁移报告，不写目标库
  --import                  向目标库 daxin 导入（需同时提供 --batch）

选项：
  --batch <key>             迁移批次标识，建议使用北京时间日期，例如 20261009-01
  --out <file>              报告输出路径，默认 docs/migration-dry-run.json
  --include-unmapped        同时解析未映射栏目（默认只处理已确认的四个栏目）
  -h, --help                显示本帮助
`

function buildReport({ articles, projectStats, includeUnmapped, batchKey }) {
  const usedSlugs = new Set()
  const parsed = []
  const caseIndex = new Map()
  const reviewItems = []
  const mediaByPath = new Map()

  for (const row of articles) {
    const project = PROJECT_CATEGORY_MAP[row.projectId]
    const article = parseLegacyArticle(row, {
      legacyProjectTitle: row.projectTitle,
      usedSlugs,
    })
    article.categorySlug = project?.slug ?? ''
    article.categoryName = project?.name ?? ''
    article.projectId = row.projectId
    article.mapped = Boolean(project)

    for (const reason of article.reviewReasons) {
      reviewItems.push({
        entityType: 'article',
        legacySourceTable: article.sourceTable,
        legacySourceId: article.sourceId,
        fieldName: reason,
        candidateValue: article.title,
        contextSnippet: article.title.slice(0, 200),
        confidence: 0,
      })
    }

    for (const candidate of article.caseCandidates) {
      const existing = caseIndex.get(candidate.caseNumber)
      if (existing) {
        existing.sources.push({ table: article.sourceTable, id: article.sourceId, title: article.title })
        existing.occurrences += 1
        // 同一案件号出现在多篇文章时保留信息量最大的那份。
        if (candidate.confidence > existing.best.confidence) existing.best = candidate
        continue
      }
      caseIndex.set(candidate.caseNumber, {
        caseNumber: candidate.caseNumber,
        best: candidate,
        occurrences: 1,
        sources: [{ table: article.sourceTable, id: article.sourceId, title: article.title }],
      })
    }

    for (const candidate of article.caseCandidates) {
      for (const field of candidate.missingFields) {
        reviewItems.push({
          entityType: 'case',
          legacySourceTable: article.sourceTable,
          legacySourceId: article.sourceId,
          fieldName: field,
          candidateValue: candidate.caseNumber,
          normalizedValue: candidate.caseNumber,
          contextSnippet: article.title.slice(0, 200),
          confidence: candidate.confidence,
        })
      }
    }

    for (const reference of article.mediaReferences) {
      const resource = parseResourcePath(reference.sourcePath)
      if (!mediaByPath.has(reference.sourcePath)) {
        mediaByPath.set(reference.sourcePath, {
          sourcePath: reference.sourcePath,
          isExternal: reference.isExternal,
          resource,
          articleCount: 0,
        })
      }
      mediaByPath.get(reference.sourcePath).articleCount += 1
    }

    parsed.push(article)
  }

  const cases = [...caseIndex.values()].sort((left, right) => left.caseNumber.localeCompare(right.caseNumber))
  const media = [...mediaByPath.values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))

  const statusBreakdown = {}
  for (const article of parsed) {
    const key = `${article.categorySlug || 'unmapped'}:${article.hasContent ? 'with_content' : 'empty'}`
    statusBreakdown[key] = (statusBreakdown[key] ?? 0) + 1
  }

  const dupes = cases.filter((item) => item.occurrences > 1)

  return {
    generatedAt: new Date().toISOString(),
    batchKey,
    includeUnmapped,
    projectCategoryMap: PROJECT_CATEGORY_MAP,
    totals: {
      legacyArticles: articles.length,
      parsedArticles: parsed.length,
      articlesWithContent: parsed.filter((article) => article.hasContent).length,
      mappedArticles: parsed.filter((article) => article.mapped).length,
      distinctCaseNumbers: cases.length,
      casesWithAllFields: cases.filter((item) => item.best.confidence === 1).length,
      caseOccurrences: cases.reduce((sum, item) => sum + item.occurrences, 0),
      duplicateCaseNumbers: dupes.length,
      distinctMediaReferences: media.length,
      externalMediaReferences: media.filter((item) => item.isExternal).length,
      localMediaReferences: media.filter((item) => !item.isExternal && item.resource).length,
      reviewItems: reviewItems.length,
    },
    projectStats,
    cases: cases.map((item) => ({
      caseNumber: item.caseNumber,
      occurrences: item.occurrences,
      filedAt: item.best.filedAt,
      plaintiff: item.best.plaintiff,
      lawFirmName: item.best.lawFirmName,
      court: item.best.court,
      confidence: item.best.confidence,
      missingFields: item.best.missingFields,
      extractionRule: item.best.extractionRule,
      sources: item.sources,
    })),
    reviewItems,
    media,
    statusBreakdown,
    articles: parsed.map((article) => ({
      sourceTable: article.sourceTable,
      sourceId: article.sourceId,
      slug: article.slug,
      title: article.title,
      categorySlug: article.categorySlug,
      publishedAt: article.publishedAt,
      hasContent: article.hasContent,
      caseNumbers: article.caseCandidates.map((candidate) => candidate.caseNumber),
      mediaCount: article.mediaReferences.length,
      reviewReasons: article.reviewReasons,
    })),
  }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error(USAGE)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(USAGE)
    return
  }
  if (options.dryRun === options.doImport) {
    console.error('必须且只能指定 --dry-run 或 --import 之一')
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const legacy = resolveLegacyConnection()
  if (!legacy) {
    console.error('无法解析旧库连接：请在 web/.env 配置 LEGACY_DB_* 或确认 DB_* 可用')
    process.exitCode = 2
    return
  }
  console.log(`旧库 ${legacy.database}（${legacy.host}:${legacy.port}，认证 ${legacy.auth}，凭据来源 ${legacy.credentialSource}），只读`)

  const articles = await fetchLegacyArticles(legacy, { includeUnmapped: options.includeUnmapped })
  const projectStats = await fetchLegacyProjectStats(legacy)
  console.log(`读取旧库文章 ${articles.length} 篇（includeUnmapped=${options.includeUnmapped}）`)

  const batchKey = options.batch || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const report = buildReport({ articles, projectStats, includeUnmapped: options.includeUnmapped, batchKey })

  if (options.dryRun) {
    const out = resolve(options.out || join('docs', 'migration-dry-run.json'))
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log('\n== dry-run 汇总 ==')
    for (const [key, value] of Object.entries(report.totals)) console.log(`  ${key}: ${value}`)
    console.log('\n== 栏目分布 ==')
    for (const row of report.projectStats) console.log(`  project ${row.project_id} ${row.project_title}: ${row.article_count}`)
    console.log('\n== 案件候选（前 10）==')
    for (const item of report.cases.slice(0, 10)) {
      console.log(`  ${item.caseNumber} 立案=${item.filedAt ?? '(缺)'} 原告=${item.plaintiff || '(缺)'} 律所=${item.lawFirmName || '(缺)'} 置信=${item.confidence} 出现=${item.occurrences}`)
    }
    console.log(`\n报告已写入 ${out}`)
    console.log('目标库未被写入。确认报告后再运行 --import。')
    return
  }

  if (!options.batch) {
    console.error('--import 必须同时提供 --batch <批次标识>，避免无法追溯的写入')
    process.exitCode = 2
    return
  }
  const target = resolveTargetConnection()
  if (!target) {
    console.error('无法解析目标库连接：请在 web/.env 配置 DB_*')
    process.exitCode = 2
    return
  }
  if (target.database === legacy.database) {
    console.error(`拒绝导入：目标库与旧库同名（${target.database}）`)
    process.exitCode = 2
    return
  }
  console.log(`目标库 ${target.database}，批次 ${options.batch}`)
  const result = await importBatch({ target, legacy, batchKey: options.batch, includeUnmapped: options.includeUnmapped, articles, report })
  console.log(`导入完成：批次 ${result.batchKey}（id=${result.batchId}），文章 ${result.articlesCreated}，案件 ${result.casesCreated}，品牌 ${result.brandsCreated}，律所 ${result.lawFirmsCreated}，核验项 ${result.reviewItemsCreated}`)
  const verification = await verifyBatch({ target, batchId: result.batchId })
  console.log(`校验：${verification.ok ? '通过' : '失败'}`)
  for (const line of verification.messages) console.log(`  ${line}`)
  process.exitCode = verification.ok ? 0 : 1
}

main().catch((error) => {
  console.error(`迁移失败：${error.message}`)
  process.exitCode = 1
})
