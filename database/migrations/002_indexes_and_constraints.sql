-- 002_indexes_and_constraints.sql
-- 无法内联进 CREATE TABLE 的索引与结构自检视图。
--
-- 为什么索引大多写在 001：
--   MySQL 8.4 既不支持 CREATE INDEX IF NOT EXISTS，也不支持
--   ALTER TABLE ... ADD INDEX IF NOT EXISTS。把索引内联进 CREATE TABLE 后，
--   语句本身即可重复执行；独立的 CREATE INDEX 在“迁移中途失败后重试”时
--   会因索引已存在报 1061 Duplicate key name，使迁移卡死。
--   因此这里仅保留无法内联的语句，并统一放进条件块：
--
--     -- @if-index-missing <索引名>
--     CREATE INDEX ...;
--     -- @end-if-index-missing
--
--   执行器先查 information_schema，索引已存在即跳过，迁移因此可安全重放。
--
-- 约定：不含 DROP、TRUNCATE、ALTER。

SET NAMES utf8mb4;

-- 中文分词全文索引：ngram 解析器。InnoDB 的 FULLTEXT 无法在内联 KEY 中
-- 指定 WITH PARSER，必须独立建，所以这里是条件块。
-- @if-index-missing idx_articles_search
CREATE FULLTEXT INDEX idx_articles_search ON articles (title, summary, content_text) WITH PARSER ngram;
-- @end-if-index-missing

-- 法院检索：案件查询页按法院筛选。
-- @if-index-missing idx_cases_court
CREATE INDEX idx_cases_court ON cases (court);
-- @end-if-index-missing

-- 旧库导入定位：迁移脚本按来源表与来源 ID 反查媒体资源。
-- @if-index-missing idx_media_assets_legacy_lookup
CREATE INDEX idx_media_assets_legacy_lookup ON media_assets (legacy_source_table, legacy_source_id);
-- @end-if-index-missing

-- 核验队列：按来源批量定位待确认项。
-- @if-index-missing idx_migration_review_source
CREATE INDEX idx_migration_review_source ON migration_review_items (legacy_source_table, legacy_source_id);
-- @end-if-index-missing

-- 结构自检视图：迁移前后人工抽查每个业务表的列数与索引数。
-- 不使用 database()，这样在任何库里都能查询；由调用方加 WHERE 过滤库名。
-- CREATE OR REPLACE VIEW 自身即可重复执行。
CREATE OR REPLACE VIEW v_schema_overview AS
SELECT
  t.TABLE_SCHEMA AS table_schema,
  t.TABLE_NAME AS table_name,
  COUNT(DISTINCT c.COLUMN_NAME) AS column_count,
  COUNT(DISTINCT s.INDEX_NAME) AS index_count
FROM information_schema.TABLES t
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
LEFT JOIN information_schema.STATISTICS s
  ON s.TABLE_SCHEMA = t.TABLE_SCHEMA AND s.TABLE_NAME = t.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND t.TABLE_NAME <> 'schema_migrations'
GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME;
