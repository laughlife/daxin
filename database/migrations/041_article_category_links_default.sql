-- 041_article_category_links_default.sql
--
--
-- 040 建表时 category_id 声明为 NOT NULL 但没有默认值，
-- 迁移静态校验要求 NOT NULL 列必须有默认值（否则插入遗漏该列会直接报错）。
-- 这里补上 DEFAULT 0，保持 NOT NULL 语义不变。
--
-- 回滚：ALTER TABLE article_category_links ALTER COLUMN category_id DROP DEFAULT;

SET NAMES utf8mb4;

ALTER TABLE article_category_links
  MODIFY COLUMN category_id BIGINT UNSIGNED NOT NULL DEFAULT 0;
