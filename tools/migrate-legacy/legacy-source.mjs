// 旧库只读读取器。
//
// 只执行 SELECT；任何写入语句都不会出现在本文件。
// 表结构依据旧站 PHPSOK 约定：cn_list 为文章主表，cn_list_5 为扩展正文表。
import { queryObjects } from './mysql-client.mjs'

/** dxfw.dr_1_share_category.id → 新库文章分类。仅有文章的栏目会参与导入。 */
export const SOURCE_CATEGORY_MAP = Object.freeze({
  1: { slug: 'tro-alert', name: 'TRO案例' },
  2: { slug: 'tro-success', name: '成功案例' },
  3: { slug: 'legal-guides', name: '普法干货' },
  4: { slug: 'overseas-business', name: '国外业务' },
  5: { slug: 'domestic-business', name: '国内业务' },
  6: { slug: 'about', name: '关于我们' },
  9: { slug: 'knowledge', name: '跨境干货' },
  10: { slug: 'news', name: '新闻资讯' },
  11: { slug: 'legal-dynamics', name: '普法动态' },
})

/** 保持旧报表字段名兼容；键现在是源栏目 ID。 */
export const PROJECT_CATEGORY_MAP = SOURCE_CATEGORY_MAP

const CROSS_BORDER_CONSULTING_IDS = new Set([1838, 1839, 1840, 1844, 1863, 1864, 1874, 1894, 1951])
const CPSC_RECALL_IDS = new Set([1909, 1918])
const FREIGHT_CASE_IDS = new Set([1661, 1663])

const DXFW_CATEGORY = Object.freeze({
  troAlert: { slug: 'tro-alert', name: 'TRO侵权预警', section: 'tro' },
  troSuccess: { slug: 'tro-success', name: 'TRO成功案例', section: 'tro' },
  cpsc: { slug: 'cpsc-recalls', name: 'CPSC召回', section: 'tro' },
  freight: { slug: 'freight-case', name: '货代案例', section: 'freight' },
  crossBorder: { slug: 'cross-border-consulting', name: '跨境咨询', section: 'domestic' },
  knowledge: { slug: 'knowledge', name: '科普干货', section: 'knowledge' },
  news: { slug: 'news', name: '热点资讯', section: 'news' },
})

/** 按旧栏目及已核定的源文章 ID 映射新版文章分类。 */
export function resolveDxfwArticleCategory(row = {}) {
  const categoryId = Number.parseInt(String(row.catid ?? ''), 10)
  const articleId = Number.parseInt(String(row.id ?? ''), 10)
  if (categoryId === 1) return DXFW_CATEGORY.troAlert
  if (categoryId === 2) return DXFW_CATEGORY.troSuccess
  if (categoryId === 4) {
    if (CPSC_RECALL_IDS.has(articleId)) return DXFW_CATEGORY.cpsc
    if (FREIGHT_CASE_IDS.has(articleId)) return DXFW_CATEGORY.freight
    return null
  }
  if (categoryId === 5) return CROSS_BORDER_CONSULTING_IDS.has(articleId)
    ? DXFW_CATEGORY.crossBorder
    : DXFW_CATEGORY.freight
  if (categoryId === 9) return DXFW_CATEGORY.knowledge
  if (categoryId === 10) return DXFW_CATEGORY.news
  if (categoryId === 11 && articleId === 1627) return DXFW_CATEGORY.troAlert
  if (categoryId === 11 && articleId === 1979) return DXFW_CATEGORY.knowledge
  return null
}

/** 把 dr_attachment_data.attachment 相对路径转换为旧站封面地址。 */
export function buildDxfwAttachmentUrl(attachment) {
  const value = String(attachment ?? '').trim()
  if (!value || /[\u0000-\u001F]/.test(value)) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return ''
  const relativePath = value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:uploadfile\/)+/i, '')
  return relativePath ? `https://daxinfawu.com/uploadfile/${relativePath}` : ''
}

export function mapDxfwArticleRow(row) {
  const categoryId = Number.parseInt(String(row.catid ?? ''), 10)
  const sourceCategory = SOURCE_CATEGORY_MAP[categoryId]
  const category = resolveDxfwArticleCategory(row)
  return {
    legacy_source_table: 'dr_1_news',
    legacy_source_id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    cateId: categoryId,
    projectId: categoryId,
    projectTitle: String(category?.name ?? row.category_name ?? sourceCategory?.name ?? ''),
    categoryName: String(category?.name ?? row.category_name ?? sourceCategory?.name ?? ''),
    categorySlug: String(category?.slug ?? sourceCategory?.slug ?? ''),
    section: String(category?.section ?? ''),
    dateline: row.inputtime,
    status: row.status,
    hidden: 0,
    content: String(row.content ?? ''),
    note: '',
    thumb: buildDxfwAttachmentUrl(row.cover_attachment ?? row.cover_url ?? row.thumb),
    isTroEntitySource: categoryId === 1,
  }
}

const ARTICLE_COLUMNS = 'l.id, l.title, l.cate_id, l.project_id, l.dateline, l.status, l.hidden, p.title AS project_title'

/**
 * 读取旧库文章。includeUnmapped 为 true 时也返回映射表之外的栏目。
 */
export async function fetchLegacyArticles(connection, { includeUnmapped = false } = {}) {
  if (connection.database === 'dxfw') return fetchDxfwArticles(connection, { includeUnmapped })
  const projectFilter = includeUnmapped ? '' : `WHERE l.project_id IN (${Object.keys(PROJECT_CATEGORY_MAP).join(', ')})`
  const rows = await queryObjects(connection, `
SELECT ${ARTICLE_COLUMNS},
  COALESCE(x.content, '') AS content,
  COALESCE(x.note, '') AS note,
  COALESCE(x.thumb, '') AS thumb
FROM da.cn_list l
LEFT JOIN da.cn_list_5 x ON x.id = l.id
LEFT JOIN da.cn_project p ON p.id = l.project_id
${projectFilter}
ORDER BY l.id
`)
  return rows.map((row) => ({
    legacy_source_table: 'cn_list',
    legacy_source_id: row.id,
    title: row.title,
    cateId: row.cate_id,
    projectId: row.project_id,
    projectTitle: row.project_title ?? '',
    dateline: row.dateline,
    status: row.status,
    hidden: row.hidden,
    content: row.content,
    note: row.note,
    thumb: row.thumb,
  }))
}

async function fetchDxfwArticles(connection, { includeUnmapped = false } = {}) {
  const categoryFilter = includeUnmapped ? '' : ` AND c.id IN (${Object.keys(SOURCE_CATEGORY_MAP).join(', ')})`
  const rows = await queryObjects(connection, `
SELECT n.id, n.title, n.catid, c.name AS category_name, n.inputtime, n.status,
  d.content,
  a.attachment AS cover_attachment
FROM dxfw.dr_1_news n
LEFT JOIN dxfw.dr_1_news_data_0 d ON d.id = n.id
LEFT JOIN dxfw.dr_1_share_category c ON c.id = n.catid
LEFT JOIN dxfw.dr_attachment_data a ON a.id = CAST(n.thumb AS UNSIGNED)
WHERE n.status = 9${categoryFilter}
ORDER BY n.id
`)
  return rows.map(mapDxfwArticleRow)
}

/** 读取旧库栏目分布，用于核对迁移范围。 */
export async function fetchLegacyProjectStats(connection) {
  if (connection.database === 'dxfw') {
    return queryObjects(connection, `
SELECT c.id AS project_id, COALESCE(c.name, '') AS project_title,
  COUNT(CASE WHEN n.status = 9 THEN 1 END) AS article_count
FROM dxfw.dr_1_share_category c
LEFT JOIN dxfw.dr_1_news n ON n.catid = c.id
GROUP BY c.id, c.name
ORDER BY c.displayorder, c.id
`)
  }
  return queryObjects(connection, `
SELECT l.project_id, COALESCE(p.title, '') AS project_title, COUNT(*) AS article_count
FROM da.cn_list l
LEFT JOIN da.cn_project p ON p.id = l.project_id
GROUP BY l.project_id, p.title
ORDER BY article_count DESC
`)
}

/** 读取旧库图片资源表，用于把正文 res/ 路径映射到 OSS 迁移对象。 */
export async function fetchLegacyResources(connection, ids = []) {
  const filter = ids.length > 0 ? `WHERE id IN (${ids.map((id) => Number.parseInt(String(id), 10)).filter(Number.isFinite).join(', ')})` : 'LIMIT 5000'
  return queryObjects(connection, `
SELECT id, folder, name, ext, filename, addtime, mime_type
FROM da.cn_res
${filter}
ORDER BY id
`)
}

/**
 * 把正文中的 res/YYYYMM/{dd}/{name}.{ext} 路径解析为可读信息。
 * 旧站上传目录按 年+月 分组，文件名即 cn_res.filename 或 cn_res.name。
 */
export function parseResourcePath(sourcePath) {
  const text = String(sourcePath ?? '').trim()
  const match = /^res\/(\d{4})(\d{2})\/(\d{2})\/([A-Za-z0-9_-]+)\.([A-Za-z0-9]+)$/i.exec(text)
  if (!match) return null
  const [, year, month, day, baseName, ext] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    baseName,
    extension: ext.toLowerCase(),
    objectKeyHint: `${year}${month}${day}/${baseName}.${ext.toLowerCase()}`,
  }
}
