// 旧库迁移导入器：把 dry-run 解析结果写入目标库 daxin。
//
// 幂等性依赖数据库中固定好的唯一键：
//   - articles.uk_articles_legacy_source (legacy_source_table, legacy_source_id)
//   - cases.uk_cases_case_number (case_number)
//   - brands.uk_brands_slug / law_firms.uk_law_firms_slug
//   - case_sources.uk_case_sources (case_id, source_table, source_id)
//   - migration_review_items.uk_migration_review_dedupe
// 因此同一批次重复执行不会产生重复文章、案件或关系。
import { executeSql, queryRows, quoteLiteral } from './mysql-client.mjs'
import { PROJECT_CATEGORY_MAP } from './legacy-source.mjs'

const ARTICLE_CATEGORY_ROWS = [
  { slug: 'news', name: '新闻资讯', section: 'news', sort: 10 },
  { slug: 'tro-alert', name: 'TRO 侵权预警', section: 'tro', sort: 20 },
  { slug: 'tro-success', name: 'TRO 成功案例', section: 'tro', sort: 30 },
  { slug: 'knowledge', name: '干货知识', section: 'knowledge', sort: 40 },
  { slug: 'labor-case', name: '劳动法案例', section: 'labor', sort: 50 },
  { slug: 'freight-case', name: '货代案例', section: 'freight', sort: 60 },
]

const IP_TYPE_ROWS = [
  { slug: 'trademark', name: '商标侵权', description: '商标权维权案件', sort: 10 },
  { slug: 'copyright', name: '版权侵权', description: '版权与作品权维权案件', sort: 20 },
  { slug: 'patent', name: '专利侵权', description: '外观与实用专利维权案件', sort: 30 },
  { slug: 'unknown', name: '待确认类型', description: '旧站未标注侵权类型，等待人工确认', sort: 90 },
]

const ADMIN_ROLE_ROWS = [
  { code: 'admin', name: '管理员', description: '管理全部内容与账号', permissions: ['*'] },
  { code: 'editor', name: '编辑', description: '管理文章、案例、品牌、律所、业务与媒体', permissions: ['article:write', 'case:write', 'brand:write', 'law_firm:write', 'service:write', 'media:write', 'settings:write'] },
  { code: 'viewer', name: '只读', description: '只能查看后台数据', permissions: ['*:read'] },
]

/** 迁移前的参考数据初始化，重复执行安全。 */
export async function seedReferenceData(target) {
  const statements = []
  for (const category of ARTICLE_CATEGORY_ROWS) {
    statements.push(`INSERT INTO article_categories (slug, name, section, sort_order, status)
VALUES (${quoteLiteral(category.slug)}, ${quoteLiteral(category.name)}, ${quoteLiteral(category.section)}, ${category.sort}, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), section = VALUES(section), sort_order = VALUES(sort_order)`)
  }
  for (const ipType of IP_TYPE_ROWS) {
    statements.push(`INSERT INTO ip_types (slug, name, description, sort_order, status)
VALUES (${quoteLiteral(ipType.slug)}, ${quoteLiteral(ipType.name)}, ${quoteLiteral(ipType.description)}, ${ipType.sort}, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), sort_order = VALUES(sort_order)`)
  }
  for (const role of ADMIN_ROLE_ROWS) {
    statements.push(`INSERT INTO admin_roles (code, name, description, permissions)
VALUES (${quoteLiteral(role.code)}, ${quoteLiteral(role.name)}, ${quoteLiteral(role.description)}, ${quoteLiteral(JSON.stringify(role.permissions))})
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), permissions = VALUES(permissions)`)
  }
  for (const statement of statements) {
    await executeSql(target, statement)
  }
  return { categories: ARTICLE_CATEGORY_ROWS.length, ipTypes: IP_TYPE_ROWS.length, roles: ADMIN_ROLE_ROWS.length }
}

/** 建立或复用迁移批次记录。 */
export async function ensureBatch(target, { batchKey, mode = 'import', sourceName = 'da' }) {
  await executeSql(target, `INSERT INTO migration_batches (batch_key, source_name, mode, status, started_at, notes)
VALUES (${quoteLiteral(batchKey)}, ${quoteLiteral(sourceName)}, ${quoteLiteral(mode)}, 'running', NOW(), '')
ON DUPLICATE KEY UPDATE status = 'running', started_at = NOW(), mode = VALUES(mode)`)
  const rows = await queryRows(target, `SELECT id FROM migration_batches WHERE batch_key = ${quoteLiteral(batchKey)}`)
  return Number(rows[0]?.[0] ?? 0)
}

const UNKNOWN_CASE_NUMBER = 'pending-review'

/**
 * 执行导入。
 * 需要调用方已通过 --dry-run 生成报告并确认；本函数不做二次确认。
 */
export async function importBatch({ target, legacy, batchKey, includeUnmapped = false, articles, report }) {
  const batchId = await ensureBatch(target, { batchKey, sourceName: legacy.database })
  await seedReferenceData(target)

  const categoryIdBySlug = new Map()
  for (const row of await queryRows(target, 'SELECT id, slug FROM article_categories')) {
    categoryIdBySlug.set(row[1], Number(row[0]))
  }
  const ipTypeIdBySlug = new Map()
  for (const row of await queryRows(target, 'SELECT id, slug FROM ip_types')) {
    ipTypeIdBySlug.set(row[1], Number(row[0]))
  }

  const usedSlugs = new Set(
    (await queryRows(target, 'SELECT slug FROM articles')).map((row) => row[0]),
  )

  let articlesCreated = 0
  let casesCreated = 0
  let brandsCreated = 0
  let lawFirmsCreated = 0
  let reviewItemsCreated = 0
  let mediaCreated = 0
  let relationsCreated = 0

  const brandIdBySlug = new Map()
  const lawFirmIdBySlug = new Map()
  const mediaIdByPath = new Map()
  const caseIdByNumber = new Map()

  const { parseLegacyArticle } = await import('./legacy-parser.mjs')

  for (const row of articles) {
    const project = PROJECT_CATEGORY_MAP[row.projectId]
    if (!project && !includeUnmapped) continue
    const article = parseLegacyArticle(row, {
      legacyProjectTitle: row.projectTitle,
      usedSlugs,
    })
    const categoryId = project ? categoryIdBySlug.get(project.slug) ?? null : null

    await executeSql(target, `INSERT INTO articles
  (slug, title, summary, content_html, content_text, category_id, published_at, status, is_featured,
   legacy_source_table, legacy_source_id, migration_batch_id, sort_order)
VALUES
  (${quoteLiteral(article.slug)}, ${quoteLiteral(article.title)}, ${quoteLiteral(article.summary)},
   ${quoteLiteral(article.contentHtml)}, ${quoteLiteral(article.contentText)}, ${categoryId ?? 'NULL'},
   ${article.publishedAt ? quoteLiteral(article.publishedAt) : 'NULL'}, ${article.hasContent ? "'published'" : "'draft'"},
   0, ${quoteLiteral(article.sourceTable)}, ${Number.parseInt(article.sourceId, 10) || 0}, ${batchId}, 0)
ON DUPLICATE KEY UPDATE
  title = VALUES(title), summary = VALUES(summary), content_html = VALUES(content_html),
  content_text = VALUES(content_text), category_id = VALUES(category_id),
  published_at = VALUES(published_at), updated_at = NOW()`)
    articlesCreated += 1

    const idRows = await queryRows(target, `SELECT id FROM articles WHERE legacy_source_table = ${quoteLiteral(article.sourceTable)} AND legacy_source_id = ${Number.parseInt(article.sourceId, 10) || 0}`)
    const articleId = Number(idRows[0]?.[0] ?? 0)
    if (!articleId) continue

    for (const reference of article.mediaReferences) {
      if (!mediaIdByPath.has(reference.sourcePath)) {
        const mediaId = await registerLegacyMedia(target, batchId, reference)
        if (mediaId) {
          mediaIdByPath.set(reference.sourcePath, mediaId)
          mediaCreated += 1
        }
      }
      const mediaId = mediaIdByPath.get(reference.sourcePath)
      await executeSql(target, `INSERT INTO article_images (article_id, media_id, source_url, position, alt_text)
VALUES (${articleId}, ${mediaId ?? 'NULL'}, ${quoteLiteral(reference.sourcePath)}, ${reference.position}, ${quoteLiteral(reference.altText)})
ON DUPLICATE KEY UPDATE media_id = VALUES(media_id), source_url = VALUES(source_url), alt_text = VALUES(alt_text)`)
    }

    for (const candidate of article.caseCandidates) {
      if (!caseIdByNumber.has(candidate.caseNumber)) {
        const caseId = await upsertCase(target, batchId, candidate, article)
        caseIdByNumber.set(candidate.caseNumber, caseId)
        casesCreated += 1
        await executeSql(target, `INSERT INTO case_sources (case_id, source_table, source_id, source_title, extraction_rule, verified)
VALUES (${caseId}, ${quoteLiteral(article.sourceTable)}, ${Number.parseInt(article.sourceId, 10) || 0}, ${quoteLiteral(article.title)}, ${quoteLiteral(candidate.extractionRule)}, 0)
ON DUPLICATE KEY UPDATE source_title = VALUES(source_title), extraction_rule = VALUES(extraction_rule)`)
      }
      const caseId = caseIdByNumber.get(candidate.caseNumber)

      if (candidate.lawFirmName) {
        const { id, created } = await upsertNamedEntity(target, {
          table: 'law_firms',
          slug: `law-firm-${candidate.lawFirmName}`,
          name: candidate.lawFirmName,
          nameEn: '',
          cache: lawFirmIdBySlug,
        })
        if (created) lawFirmsCreated += 1
        await executeSql(target, `INSERT INTO case_law_firms (case_id, law_firm_id, is_primary)
VALUES (${caseId}, ${id}, 1) ON DUPLICATE KEY UPDATE is_primary = 1`)
        relationsCreated += 1
      }

      const brandName = deriveBrandName(candidate)
      if (brandName) {
        const { id, created } = await upsertNamedEntity(target, {
          table: 'brands',
          slug: `brand-${brandName}`,
          name: brandName,
          nameEn: '',
          cache: brandIdBySlug,
        })
        if (created) brandsCreated += 1
        await executeSql(target, `INSERT INTO case_brands (case_id, brand_id)
VALUES (${caseId}, ${id}) ON DUPLICATE KEY UPDATE brand_id = VALUES(brand_id)`)
        relationsCreated += 1
      }
    }
  }

  for (const item of report.reviewItems) {
    await executeSql(target, `INSERT INTO migration_review_items
  (batch_id, entity_type, legacy_source_table, legacy_source_id, field_name, candidate_value, normalized_value, context_snippet, confidence, status)
VALUES
  (${batchId}, ${quoteLiteral(item.entityType)}, ${quoteLiteral(item.legacySourceTable)}, ${Number.parseInt(item.legacySourceId, 10) || 0},
   ${quoteLiteral(item.fieldName)}, ${quoteLiteral(item.candidateValue)}, ${quoteLiteral(item.normalizedValue ?? '')},
   ${quoteLiteral(item.contextSnippet)}, ${Number(item.confidence) || 0}, 'open')
ON DUPLICATE KEY UPDATE candidate_value = VALUES(candidate_value), context_snippet = VALUES(context_snippet), confidence = VALUES(confidence)`)
    reviewItemsCreated += 1
  }

  await executeSql(target, `UPDATE migration_batches SET
  status = 'completed', finished_at = NOW(),
  articles_created = ${articlesCreated}, cases_created = ${casesCreated},
  brands_created = ${brandsCreated}, law_firms_created = ${lawFirmsCreated},
  media_created = ${mediaCreated}, review_items_created = ${reviewItemsCreated}
WHERE id = ${batchId}`)

  return {
    batchKey,
    batchId,
    articlesCreated,
    casesCreated,
    brandsCreated,
    lawFirmsCreated,
    mediaCreated,
    reviewItemsCreated,
    relationsCreated,
  }
}

/**
 * 旧站正文没有独立的品牌字段，这里只在原告名称可稳定归一化时提取品牌。
 * 无法判断时返回空，避免把猜测写入业务表；此类情况进入人工核验。
 */
function deriveBrandName(candidate) {
  const plaintiff = String(candidate.plaintiff ?? '').trim()
  if (!plaintiff) return ''
  const normalized = plaintiff
    .replace(/[，,]\s*(?:inc|llc|ltd|co|corp|corporation|company|gmbh|s\.a\.|p\.a\.|d\/b\/a).*$/i, '')
    .replace(/\b(?:INC|LLC|LTD|CO|CORP|CORPORATION|COMPANY|GMBH|LP|LLP|PLLC|P\.A\.|S\.A\.)\b\.?/gi, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[^\p{L}\p{N}\s&'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length < 2 || normalized.length > 80) return ''
  return normalized
}

/** 按 slug 幂等写入品牌或律所，返回主键与是否新建。 */
async function upsertNamedEntity(target, { table, slug, name, nameEn, cache }) {
  const baseSlug = slugifyAscii(slug)
  if (cache.has(baseSlug)) return { id: cache.get(baseSlug), created: false }
  await executeSql(target, `INSERT INTO ${table} (slug, name, name_en, status)
VALUES (${quoteLiteral(baseSlug)}, ${quoteLiteral(name)}, ${quoteLiteral(nameEn)}, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()`)
  const rows = await queryRows(target, `SELECT id FROM ${table} WHERE slug = ${quoteLiteral(baseSlug)}`)
  const id = Number(rows[0]?.[0] ?? 0)
  cache.set(baseSlug, id)
  return { id, created: true }
}

function slugifyAscii(input) {
  const value = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
  return value || `ref-${Math.abs(hashString(input)).toString(16)}`
}

function hashString(text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0
  }
  return hash
}

/** 写入或更新案件主体。 */
async function upsertCase(target, batchId, candidate, article) {
  const yearMatch = /^([0-9]{2})/.exec(candidate.caseNumber)
  const seqMatch = /-([0-9]+)$/.exec(candidate.caseNumber)
  const typeMatch = /^[0-9]{2}-([a-z]{2})/.exec(candidate.caseNumber)
  const caseYear = yearMatch ? 2000 + Number(yearMatch[1]) : null
  const caseSeq = seqMatch ? Number(seqMatch[1]) : null
  const caseType = typeMatch ? typeMatch[1] : 'cv'

  await executeSql(target, `INSERT INTO cases
  (case_number, case_year, case_seq, case_type, court, filed_at, plaintiff, title, summary, status, publish_status,
   legacy_source_table, legacy_source_id, migration_batch_id)
VALUES
  (${quoteLiteral(candidate.caseNumber)}, ${caseYear ?? 'NULL'}, ${caseSeq ?? 'NULL'}, ${quoteLiteral(caseType)},
   ${quoteLiteral(candidate.court)}, ${candidate.filedAt ? quoteLiteral(candidate.filedAt) : 'NULL'},
   ${quoteLiteral(candidate.plaintiff)}, ${quoteLiteral(article.title)}, ${quoteLiteral(article.summary)},
   'open', 'published', ${quoteLiteral(article.sourceTable)}, ${Number.parseInt(article.sourceId, 10) || 0}, ${batchId})
ON DUPLICATE KEY UPDATE
  court = IF(VALUES(court) <> '', VALUES(court), court),
  filed_at = COALESCE(VALUES(filed_at), filed_at),
  plaintiff = IF(VALUES(plaintiff) <> '', VALUES(plaintiff), plaintiff),
  updated_at = NOW()`)
  const rows = await queryRows(target, `SELECT id FROM cases WHERE case_number = ${quoteLiteral(candidate.caseNumber)}`)
  return Number(rows[0]?.[0] ?? 0)
}

/** 登记旧站图片为媒体记录；本地 res/ 路径需要后续上传 OSS 后才能补 public_url。 */
async function registerLegacyMedia(target, batchId, reference) {
  const objectKey = reference.isExternal
    ? `legacy/external/${encodeURIComponent(reference.sourcePath).slice(0, 300)}`
    : reference.sourcePath.replace(/^\/+/, '')
  await executeSql(target, `INSERT INTO media_assets
  (object_key, public_url, file_name, mime_type, byte_size, usage_scope, title, legacy_source_table, legacy_source_id)
VALUES
  (${quoteLiteral(objectKey)}, ${quoteLiteral(reference.isExternal ? reference.sourcePath : '')},
   ${quoteLiteral(reference.sourcePath.split('/').pop() ?? '')}, '', 0, 'article',
   ${quoteLiteral(reference.altText)}, 'cn_res', 0)
ON DUPLICATE KEY UPDATE updated_at = NOW()`)
  const rows = await queryRows(target, `SELECT id FROM media_assets WHERE object_key = ${quoteLiteral(objectKey)}`)
  return Number(rows[0]?.[0] ?? 0)
}

/** 导入后的数量校验。 */
export async function verifyBatch({ target, batchId }) {
  const messages = []
  const articles = await queryRows(target, `SELECT COUNT(*) FROM articles WHERE migration_batch_id = ${batchId}`)
  const cases = await queryRows(target, `SELECT COUNT(*) FROM cases WHERE migration_batch_id = ${batchId}`)
  const reviewOpen = await queryRows(target, `SELECT COUNT(*) FROM migration_review_items WHERE batch_id = ${batchId} AND status = 'open'`)
  const missingFirm = await queryRows(target, `SELECT COUNT(*) FROM cases WHERE migration_batch_id = ${batchId} AND plaintiff = ''`)
  const dates = await queryRows(target, `SELECT MIN(filed_at), MAX(filed_at) FROM cases WHERE migration_batch_id = ${batchId}`)
  const duplicates = await queryRows(target, `SELECT case_number, COUNT(*) AS n FROM cases GROUP BY case_number HAVING n > 1`)

  const articleCount = Number(articles[0]?.[0] ?? 0)
  const caseCount = Number(cases[0]?.[0] ?? 0)
  const openReview = Number(reviewOpen[0]?.[0] ?? 0)
  const missingPlaintiff = Number(missingFirm[0]?.[0] ?? 0)
  const duplicateCount = duplicates.length

  messages.push(`批次文章数：${articleCount}`)
  messages.push(`批次案件数：${caseCount}`)
  messages.push(`待人工核验：${openReview}`)
  messages.push(`缺少原告的案件：${missingPlaintiff}`)
  messages.push(`起诉时间范围：${dates[0]?.[0] ?? '(空)'} ~ ${dates[0]?.[1] ?? '(空)'}`)
  messages.push(`重复案件号：${duplicateCount}`)

  return {
    ok: articleCount > 0 && duplicateCount === 0,
    articleCount,
    caseCount,
    openReview,
    missingPlaintiff,
    duplicateCount,
    messages,
  }
}
