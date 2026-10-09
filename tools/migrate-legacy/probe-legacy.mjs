// 旧库只读探查脚本：统计正文特征，为解析规则提供依据。
//
// 只执行 SELECT；不写入旧库、不修改任何数据。
// 用法：node tools/migrate-legacy/probe-legacy.mjs
import { queryObjects, resolveLegacyConnection } from './mysql-client.mjs'

const connection = resolveLegacyConnection()
if (!connection) {
  console.error('无法解析旧库连接：请在 web/.env 配置 LEGACY_DB_* 或 mysql 登录配置')
  process.exit(2)
}
console.log(`旧库 ${connection.database}（${connection.host}:${connection.port}，认证方式 ${connection.auth}），只读探查`)

const stats = await queryObjects(connection, `
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN c.content IS NULL OR c.content = '' THEN 1 ELSE 0 END) AS empty_content,
  SUM(CASE WHEN c.note IS NULL OR c.note = '' THEN 1 ELSE 0 END) AS empty_note,
  SUM(CASE WHEN c.content LIKE '%<img%' THEN 1 ELSE 0 END) AS content_with_img,
  SUM(CASE WHEN c.content LIKE '%<script%' THEN 1 ELSE 0 END) AS content_with_script,
  SUM(CASE WHEN c.content LIKE '%style=%' THEN 1 ELSE 0 END) AS content_with_style_attr,
  SUM(CASE WHEN c.content LIKE '%http://%' THEN 1 ELSE 0 END) AS content_with_http,
  SUM(CASE WHEN c.content LIKE '%https://%' THEN 1 ELSE 0 END) AS content_with_https,
  SUM(CASE WHEN c.content LIKE '%/upload/%' OR c.content LIKE '%/uploads/%' THEN 1 ELSE 0 END) AS content_with_upload_path,
  SUM(CASE WHEN c.thumb IS NOT NULL AND c.thumb <> '' THEN 1 ELSE 0 END) AS with_thumb,
  SUM(CASE WHEN l.title REGEXP '[0-9]{2}-cv-[0-9]+' THEN 1 ELSE 0 END) AS title_case_number,
  SUM(CASE WHEN c.content REGEXP '[0-9]{2}-cv-[0-9]+' THEN 1 ELSE 0 END) AS content_case_number,
  SUM(CASE WHEN c.content LIKE '%律所%' OR c.content LIKE '%事务所%' THEN 1 ELSE 0 END) AS content_law_firm_words
FROM da.cn_list l
LEFT JOIN da.cn_list_5 c ON c.id = l.id
`)

console.log('\n== 正文特征统计 ==')
for (const row of stats) {
  for (const [key, value] of Object.entries(row)) console.log(`  ${key}: ${value}`)
}

const byProject = await queryObjects(connection, `
SELECT l.project_id, p.title AS project_title, COUNT(*) AS n
FROM da.cn_list l
LEFT JOIN da.cn_project p ON p.id = l.project_id
GROUP BY l.project_id, p.title
ORDER BY n DESC
`)
console.log('\n== 按栏目分布 ==')
for (const row of byProject) console.log(`  project ${row.project_id} ${row.project_title}: ${row.n}`)

const imgTags = await queryObjects(connection, `
SELECT
  SUBSTRING(c.content, LOCATE('<img', c.content), 200) AS img_tag
FROM da.cn_list_5 c
WHERE c.content LIKE '%<img%'
LIMIT 5
`)
console.log('\n== <img> 写法样例（各截取 200 字符）==')
for (const row of imgTags) console.log(`  ${JSON.stringify(row.img_tag)}`)

const caseNumberSamples = await queryObjects(connection, `
SELECT l.id, l.title
FROM da.cn_list l
WHERE l.title REGEXP '[0-9]{2}-cv-[0-9]+'
ORDER BY l.id
LIMIT 8
`)
console.log('\n== 标题中的案件号样例 ==')
for (const row of caseNumberSamples) console.log(`  ${row.id}: ${row.title}`)

const bodyCaseNumberSamples = await queryObjects(connection, `
SELECT c.id, SUBSTRING(c.content, GREATEST(1, LOCATE('cv-', c.content) - 120), 260) AS around
FROM da.cn_list_5 c
JOIN da.cn_list l ON l.id = c.id
WHERE c.content REGEXP '[0-9]{2}-cv-[0-9]+'
  AND l.title NOT REGEXP '[0-9]{2}-cv-[0-9]+'
LIMIT 3
`)
console.log('\n== 正文中案件号上下文样例（标题不含案件号）==')
for (const row of bodyCaseNumberSamples) console.log(`  ${row.id}: ${JSON.stringify(row.around)}`)

const distinctCaseNumbers = await queryObjects(connection, `
SELECT COUNT(DISTINCT UPPER(REGEXP_SUBSTR(l.title, '[0-9]{2}-cv-[0-9]+'))) AS distinct_in_title
FROM da.cn_list l
WHERE l.title REGEXP '[0-9]{2}-cv-[0-9]+'
`)
console.log('\n== 标题中不同案件号数量 ==')
for (const row of distinctCaseNumbers) console.log(`  ${row.distinct_in_title}`)

// 结构化字段的写法分布：正文里各类标签的出现次数。
const labelStats = await queryObjects(connection, `
SELECT
  SUM(c.content LIKE '%案件号%') AS label_case_number,
  SUM(c.content LIKE '%案件编号%') AS label_case_code,
  SUM(c.content LIKE '%立案时间%') AS label_filed_at,
  SUM(c.content LIKE '%起诉时间%') AS label_sue_at,
  SUM(c.content LIKE '%原告%') AS label_plaintiff,
  SUM(c.content LIKE '%代理律所%') AS label_law_firm,
  SUM(c.content LIKE '%律所%') AS label_firm_any,
  SUM(c.content LIKE '%维权产品%') AS label_product,
  SUM(c.content LIKE '%侵权类型%') AS label_ip_type,
  SUM(c.content LIKE '%品牌%') AS label_brand_any,
  SUM(c.content LIKE '%法院%') AS label_court
FROM da.cn_list_5 c
`)
console.log('\n== 正文标签出现次数 ==')
for (const row of labelStats) {
  for (const [key, value] of Object.entries(row)) console.log(`  ${key}: ${value}`)
}

// 案件号在正文中的原始写法样例（含分隔符与长度差异）。
const rawNumbers = await queryObjects(connection, `
SELECT DISTINCT REGEXP_SUBSTR(c.content, '[0-9]{2,4}[[:space:]]*-[[:space:]]*cv[[:space:]]*-[[:space:]]*[0-9]+') AS raw_number
FROM da.cn_list_5 c
WHERE c.content REGEXP '[0-9]{2,4}[[:space:]]*-[[:space:]]*cv[[:space:]]*-[[:space:]]*[0-9]+'
LIMIT 25
`)
console.log('\n== 正文案件号原始写法（去重前 25 个）==')
for (const row of rawNumbers) console.log(`  ${JSON.stringify(row.raw_number)}`)

// 代理律所行的原文片段，用于确定分隔规则。
const lawFirmSamples = await queryObjects(connection, `
SELECT c.id, SUBSTRING(c.content, LOCATE('代理律所', c.content), 90) AS around
FROM da.cn_list_5 c
WHERE c.content LIKE '%代理律所%'
LIMIT 12
`)
console.log('\n== 代理律所原文片段 ==')
for (const row of lawFirmSamples) console.log(`  ${row.id}: ${JSON.stringify(row.around)}`)

// 原告行的原文片段。
const plaintiffSamples = await queryObjects(connection, `
SELECT c.id, SUBSTRING(c.content, LOCATE('原告', c.content), 80) AS around
FROM da.cn_list_5 c
WHERE c.content LIKE '%原告%'
LIMIT 12
`)
console.log('\n== 原告原文片段 ==')
for (const row of plaintiffSamples) console.log(`  ${row.id}: ${JSON.stringify(row.around)}`)

// 立案时间行的原文片段，确认日期格式。
const dateSamples = await queryObjects(connection, `
SELECT c.id,
  SUBSTRING(c.content, LOCATE('立案时间', c.content), 60) AS filed,
  SUBSTRING(c.content, LOCATE('起诉时间', c.content), 60) AS sue
FROM da.cn_list_5 c
WHERE c.content LIKE '%立案时间%' OR c.content LIKE '%起诉时间%'
LIMIT 12
`)
console.log('\n== 日期字段原文片段 ==')
for (const row of dateSamples) console.log(`  ${row.id}: 立案=${JSON.stringify(row.filed)} 起诉=${JSON.stringify(row.sue)}`)

// 缩略图路径写法。
const thumbs = await queryObjects(connection, `
SELECT DISTINCT c.thumb
FROM da.cn_list_5 c
WHERE c.thumb IS NOT NULL AND c.thumb <> ''
LIMIT 10
`)
console.log('\n== 缩略图路径样例 ==')
for (const row of thumbs) console.log(`  ${JSON.stringify(row.thumb)}`)

