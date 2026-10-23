-- 036_article_title_font_size.sql
--
--
-- 需求（2026-10-21）：文章列表改为「标题在上、长图在下」，并套用微信原文的标题字号。
-- 微信文章页的标题字号是运行时 computed（HTML 里没有），需要浏览器读取后落库。
--
-- 新增：
--   wechat_album_items.title_font_size  采集时抓到的标题字号（px）
--   articles.title_font_size            前台渲染用；为空时前端回退默认字号

SET NAMES utf8mb4;

ALTER TABLE wechat_album_items
  ADD COLUMN title_font_size SMALLINT UNSIGNED NULL DEFAULT NULL AFTER title;

ALTER TABLE articles
  ADD COLUMN title_font_size SMALLINT UNSIGNED NULL DEFAULT NULL AFTER title;
