// 品牌 / 律所与案件的文本匹配规则（纯函数，不访问数据库）。
//
// 公开数据层与后台都复用这一份，避免两边口径漂移（后台列表的关联案件数、
// 公开站目录与详情必须是同一套规则）。
//
// 规则：
// - 英文主干（生成列 `*_latin`，已转小写且只保留字母数字）双向包含，或前 6 位相同；
// - 中文名称去空格后双向包含；品牌另看 aliases，律所另看简称 short_name；
// - 律所简称的英文主干按前 6 位参与匹配。
//
// 用 LOCATE 而不是 LIKE：两者在 utf8mb4_unicode_ci 下都按排序规则比较（大小写不敏感），
// 但 LOCATE 把 `%`/`_` 当普通字符，名称里带这些符号时不会误判成通配符。
//
// 入参是「列表达式」而不是固定列名，方便调用方按需传入原始列或已归一化的派生列：
// 品牌目录要把归一化结果物化后复用（见 case-queries 的 brandDirectoryCte），
// 单实体统计则直接拼表达式。

/** 匹配条件用到的列表达式；可选列按实体类型（品牌别名 / 律所简称）传入。 */
export interface EntityCaseMatchColumns {
  /** 案件侧英文主干：cases.brand_latin / cases.firm_latin */
  caseLatin: string
  /** 案件侧去空格名称：REPLACE(TRIM(cases.brand_name), ' ', '') 等 */
  caseNameKey: string
  /** 目录侧英文主干：brands/law_firms.name_latin */
  entityLatin: string
  /** 目录侧去空格名称 */
  entityNameKey: string
  /** 律所简称英文主干（law_firms.short_latin），可选 */
  entityShortLatin?: string
  /** 律所简称去空格（law_firms.short_name），可选 */
  entityShortNameKey?: string
  /** 品牌别名去空格（brands.aliases），可选 */
  entityAliasesKey?: string
}

export function entityCaseMatchSql(columns: EntityCaseMatchColumns): string {
  const latinRules = [
    `LOCATE(${columns.caseLatin}, ${columns.entityLatin}) > 0`,
    `LOCATE(${columns.entityLatin}, ${columns.caseLatin}) > 0`,
    `LEFT(${columns.entityLatin}, 6) = LEFT(${columns.caseLatin}, 6)`,
  ]
  if (columns.entityShortLatin) {
    latinRules.push(`(${columns.entityShortLatin} <> '' AND LEFT(${columns.entityShortLatin}, 6) = LEFT(${columns.caseLatin}, 6))`)
  }

  const nameRules = [
    `LOCATE(${columns.caseNameKey}, ${columns.entityNameKey}) > 0`,
    `LOCATE(${columns.entityNameKey}, ${columns.caseNameKey}) > 0`,
  ]
  if (columns.entityShortNameKey) {
    nameRules.push(`(${columns.entityShortNameKey} <> '' AND LOCATE(${columns.caseNameKey}, ${columns.entityShortNameKey}) > 0)`)
  }
  if (columns.entityAliasesKey) {
    nameRules.push(`(${columns.entityAliasesKey} <> '' AND LOCATE(${columns.caseNameKey}, ${columns.entityAliasesKey}) > 0)`)
  }

  return `(
    (CHAR_LENGTH(${columns.caseLatin}) >= 4 AND CHAR_LENGTH(${columns.entityLatin}) >= 4
      AND (${latinRules.join('\n        OR ')}))
    OR (CHAR_LENGTH(${columns.caseNameKey}) >= 2 AND (${nameRules.join('\n        OR ')}))
  )`
}

/** 目录侧（别名 e）与案件侧（别名 c）的匹配条件，供单实体统计使用。 */
export function entityCaseMatchSqlForEntity(table: 'brands' | 'law_firms'): string {
  return table === 'brands'
    ? entityCaseMatchSql({
      caseLatin: 'c.brand_latin',
      caseNameKey: `REPLACE(TRIM(c.brand_name), ' ', '')`,
      entityLatin: 'e.name_latin',
      entityNameKey: `REPLACE(e.name, ' ', '')`,
      entityAliasesKey: `REPLACE(e.aliases, ' ', '')`,
    })
    : entityCaseMatchSql({
      caseLatin: 'c.firm_latin',
      caseNameKey: `REPLACE(TRIM(c.law_firm_name), ' ', '')`,
      entityLatin: 'e.name_latin',
      entityNameKey: `REPLACE(e.name, ' ', '')`,
      entityShortLatin: 'e.short_latin',
      entityShortNameKey: `REPLACE(e.short_name, ' ', '')`,
    })
}

/**
 * 品牌 / 律所的公开关联案件数：只统计已发布案件，随发布状态实时变化。
 * 关联表 case_brands / case_law_firms 已停止写入，这里直接按文本匹配。
 */
export function publishedEntityCaseCountSql(table: 'brands' | 'law_firms'): string {
  return `(SELECT COUNT(DISTINCT c.id)
    FROM cases c
    WHERE c.publish_status = 'published' AND ${entityCaseMatchSqlForEntity(table)})`
}
