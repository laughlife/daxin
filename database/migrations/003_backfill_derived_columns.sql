-- 003_backfill_derived_columns.sql
--
-- @data-migration
--
-- 回填由关联表派生的统计与待确认分类。本文件是纯数据迁移：只使用 INSERT/UPDATE，
-- 不包含建表或改结构语句，schema-check 会按数据迁移校验（禁止 DDL 混入）。
--
-- 背景（2026-10-09 迁移后实测）：
--   1. brands.case_count 与 law_firms.case_count 全为 0，但 case_brands / case_law_firms
--      已有 818 / 823 行数据；品牌库与律所目录因此全部显示“0 条关联案件”。
--   2. case_ip_types 为空。旧站正文没有“侵权类型”字段，只有 10 篇提到“维权产品”，
--      没有任何可靠标签可以推导侵权类型（正文出现“商标/专利/版权”字样只说明在讨论该话题，
--      不能证明本案类型）。因此不臆造类型，统一标记为 ip_types.unknown（待确认类型），
--      由后台核验队列人工确认后再改。这样前台“侵权类型”列显示“待确认类型”而不是空白或假值。
--
-- 重复执行安全：全部使用幂等写入（INSERT IGNORE / 关联子查询 UPDATE）。
-- 不含 DROP、TRUNCATE、ALTER。

SET NAMES utf8mb4;

-- 1) 品牌关联案件数：按已发布案件统计。
UPDATE brands b
SET b.case_count = (
  SELECT COUNT(*)
  FROM case_brands cb
  JOIN cases c ON c.id = cb.case_id
  WHERE cb.brand_id = b.id
    AND c.publish_status = 'published'
);

-- 2) 律所关联案件数：同上。
UPDATE law_firms lf
SET lf.case_count = (
  SELECT COUNT(*)
  FROM case_law_firms clf
  JOIN cases c ON c.id = clf.case_id
  WHERE clf.law_firm_id = lf.id
    AND c.publish_status = 'published'
);

-- 3) 未标注侵权类型的案件统一标记为“待确认类型”，供后台核验。
INSERT IGNORE INTO case_ip_types (case_id, ip_type_id)
SELECT c.id, t.id
FROM cases c
JOIN ip_types t ON t.slug = 'unknown'
WHERE NOT EXISTS (
  SELECT 1 FROM case_ip_types cit WHERE cit.case_id = c.id
);
