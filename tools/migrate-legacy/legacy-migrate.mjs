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
import { applyMigrations, createTestDatabase, isTestDatabaseName } from './schema-check.mjs'
import { parseLegacyArticle, slugify } from './legacy-parser.mjs'
import { PROJECT_CATEGORY_MAP, fetchLegacyArticles, fetchLegacyProjectStats, parseResourcePath } from './legacy-source.mjs'
import { importBatch, verifyBatch } from './legacy-import.mjs'

function parseArgs(argv) {
  const options = { dryRun: false, doImport: false, includeUnmapped: false, batch: '', out: '', database: '', sourceDatabase: 'dxfw', ensureSchema: false, mediaMap: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--import') options.doImport = true
    else if (arg === '--include-unmapped') options.includeUnmapped = true
    else if (arg === '--ensure-schema') options.ensureSchema = true
    else if (arg === '--batch') options.batch = argv[++index] ?? ''
    else if (arg.startsWith('--batch=')) options.batch = arg.slice('--batch='.length)
    else if (arg === '--out') options.out = argv[++index] ?? ''
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length)
    else if (arg === '--media-map') options.mediaMap = argv[++index] ?? ''
    else if (arg.startsWith('--media-map=')) options.mediaMap = arg.slice('--media-map='.length)
    else if (arg === '--database') options.database = argv[++index] ?? ''
    else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length)
    else if (arg === '--source-database') options.sourceDatabase = argv[++index] ?? ''
    else if (arg.startsWith('--source-database=')) options.sourceDatabase = arg.slice('--source-database='.length)
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

const USAGE = `用法：node tools/migrate-legacy/legacy-migrate.mjs <模式> [选项]

模式（必须二选一）：
  --dry-run                 只读取旧库并生成迁移报告，不写目标库
  --import                  向目标库导入（需同时提供 --batch）

选项：
  --batch <key>             迁移批次标识，建议使用北京时间日期，例如 20261009-01
  --out <file>              报告输出路径，默认 docs/migration-dry-run.json
  --database <name>         导入到指定库（默认取 web/.env 的 DB_NAME）
  --media-map <file>        图片已上传 OSS 后生成的映射文件（--import 必填）
  --source-database <name>  只读源库（本次迁移使用 dxfw，默认 dxfw）
  --ensure-schema           导入前先执行 database/migrations 下的 DDL
  --include-unmapped        同时解析未映射栏目（默认只处理已确认的四个栏目）
  -h, --help                显示本帮助
`

function buildReport({ articles, projectStats, includeUnmapped, batchKey }) {
  const usedSlugs = new Set()
  const parsed = []
  const caseIndex = new Map()
  const brandIndex = new Map()
  const lawFirmIndex = new Map()
  const reviewItems = []
  const mediaByPath = new Map()
  let incompleteTroCaseBlocks = 0

  for (const row of articles) {
    const project = row.categorySlug
      ? { slug: row.categorySlug, name: row.categoryName ?? row.projectTitle }
      : PROJECT_CATEGORY_MAP[row.projectId]
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

    const troCandidates = row.isTroEntitySource
      ? article.caseCandidates
      : []
    const completeCandidates = troCandidates.filter((candidate) => candidate.complete)
    incompleteTroCaseBlocks += troCandidates.length - completeCandidates.length

    for (const candidate of completeCandidates) {
      if (candidate.brandName) mergeEntityCandidate(brandIndex, candidate.brandName, candidate.brandSummary)
      if (candidate.lawFirmName) mergeEntityCandidate(lawFirmIndex, candidate.lawFirmName, candidate.lawFirmSummary)
    }

    for (const candidate of completeCandidates) {
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

    // 封面图不在正文 img 标签中，也必须进入媒体迁移清单。
    const coverPath = String(row.thumb ?? '').trim()
    if (coverPath) {
      const resource = parseResourcePath(coverPath)
      if (!mediaByPath.has(coverPath)) {
        mediaByPath.set(coverPath, { sourcePath: coverPath, isExternal: /^https?:/i.test(coverPath), resource, articleCount: 0, coverCount: 0 })
      }
      mediaByPath.get(coverPath).coverCount = (mediaByPath.get(coverPath).coverCount ?? 0) + 1
    }

    parsed.push({ ...article, caseCandidates: completeCandidates })
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
      casesWithAllFields: cases.length,
      incompleteTroCaseBlocks,
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
      brandName: item.best.brandName,
      ipTypes: item.best.ipTypes,
      court: item.best.court,
      brandSummary: item.best.brandSummary,
      lawFirmSummary: item.best.lawFirmSummary,
      confidence: item.best.confidence,
      missingFields: item.best.missingFields,
      extractionRule: item.best.extractionRule,
      sources: item.sources,
    })),
    brands: [...brandIndex.values()].sort((a, b) => a.name.localeCompare(b.name)),
    lawFirms: [...lawFirmIndex.values()].sort((a, b) => a.name.localeCompare(b.name)),
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

function mergeEntityCandidate(index, rawName, summary) {
  const name = String(rawName ?? '').trim()
  if (!name) return
  const slug = slugify(name)
  const existing = index.get(slug)
  if (!existing) {
    index.set(slug, { slug, name, aliases: [], summary: String(summary ?? '').trim(), occurrences: 1 })
    return
  }
  existing.occurrences += 1
  if (name !== existing.name && !existing.aliases.includes(name)) existing.aliases.push(name)
  const candidateSummary = String(summary ?? '').trim()
  if (candidateSummary.length > existing.summary.length) existing.summary = candidateSummary
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
  if (options.sourceDatabase !== 'dxfw') {
    console.error('本次 CMS 数据迁移只允许源库 dxfw；旧库仅执行只读查询。')
    process.exitCode = 2
    return
  }
  legacy.database = options.sourceDatabase
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
  if (options.database) {
    if (options.database === legacy.database) {
      console.error(`拒绝导入：目标库与旧库同名（${options.database}）`)
      process.exitCode = 2
      return
    }
    target.database = options.database
  }
  if (target.database === legacy.database) {
    console.error(`拒绝导入：目标库与旧库同名（${target.database}）`)
    process.exitCode = 2
    return
  }
  if (options.ensureSchema) {
    if (isTestDatabaseName(target.database)) {
      await createTestDatabase(target, target.database)
    } else if (target.database !== resolveTargetConnection()?.database) {
      console.error(`拒绝在非测试库 ${target.database} 上自动建结构：请先运行 schema-check --apply`)
      process.exitCode = 2
      return
    }
    const migrations = await applyMigrations(target, { database: target.database })
    console.log(`结构准备：本次执行 ${migrations.applied.length} 个迁移，跳过 ${migrations.skipped.length} 个`)
  }
  console.log(`目标库 ${target.database}，批次 ${options.batch}`)
  const result = await importBatch({ target, legacy, batchKey: options.batch, includeUnmapped: options.includeUnmapped, articles, report, mediaMapPath: options.mediaMap })
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
