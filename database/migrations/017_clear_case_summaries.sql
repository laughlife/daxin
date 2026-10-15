-- 017_clear_case_summaries.sql
--
-- @data-migration
--
-- 案件摘要已从后台写入与全站展示中移除，清空历史案件摘要值。

UPDATE cases
SET summary = NULL
WHERE summary IS NOT NULL;
