// 旧库只读读取器。
//
// 只执行 SELECT；任何写入语句都不会出现在本文件。
// 表结构依据旧站 PHPSOK 约定：cn_list 为文章主表，cn_list_5 为扩展正文表。
import { queryObjects } from './mysql-client.mjs'

/** 需要迁移的旧站栏目（project_id → 目标文章分类 slug）。 */
export const PROJECT_CATEGORY_MAP = Object.freeze({
  5: { slug: 'news', name: '新闻资讯' },
  9: { slug: 'tro-alert', name: 'TRO 侵权预警' },
  10: { slug: 'tro-success', name: 'TRO 成功案例' },
  11: { slug: 'knowledge', name: '干货知识' },
})

const ARTICLE_COLUMNS = 'l.id, l.title, l.cate_id, l.project_id, l.dateline, l.status, l.hidden, p.title AS project_title'

/**
 * 读取旧库文章。includeUnmapped 为 true 时也返回映射表之外的栏目。
 */
export async function fetchLegacyArticles(connection, { includeUnmapped = false } = {}) {
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

/** 读取旧库栏目分布，用于核对迁移范围。 */
export async function fetchLegacyProjectStats(connection) {
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
