-- 049_case_brand_and_firm_names.sql
--
-- 需求（2026-10-28）：把「涉案品牌 / 代理律所」这两个字段恢复到 cases 表本身。
-- 采集改为不再拆分写入 brands / law_firms 关联表后，案件列表的这两列失去了来源，
-- 现在直接存冗余文本，列表与详情都从这里读（关联表仅作扩展信息）。
--
-- 回填来源：case_ingest_sources.source_brand / source_law_firm（采集时保留的原始文本）。
--
-- 回滚：ALTER TABLE cases DROP COLUMN brand_name, DROP COLUMN law_firm_name;

SET NAMES utf8mb4;

ALTER TABLE cases
  ADD COLUMN brand_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '涉案品牌（采集原始文本）' AFTER plaintiff,
  ADD COLUMN law_firm_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '代理律所（采集原始文本）' AFTER brand_name;

UPDATE cases c
JOIN case_ingest_sources s ON s.case_id = c.id
SET c.brand_name = LEFT(TRIM(COALESCE(s.source_brand, '')), 255),
    c.law_firm_name = LEFT(TRIM(COALESCE(s.source_law_firm, '')), 255)
WHERE (c.brand_name = '' OR c.law_firm_name = '')
  AND (COALESCE(s.source_brand, '') <> '' OR COALESCE(s.source_law_firm, '') <> '');
