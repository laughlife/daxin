-- 018_clear_article_summaries.sql
--
-- @data-migration
--
-- 文章摘要已从后台、API 与官网展示中移除，清空历史文章摘要值。

UPDATE articles
SET summary = NULL
WHERE summary IS NOT NULL;
