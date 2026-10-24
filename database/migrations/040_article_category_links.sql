-- 040_article_category_links.sql
--
-- 需求（2026-10-24）：一篇文章可能同时属于多个栏目（公众号一稿多投到多个合集，
-- 例如同时被 tro-classic-album 与 tro-knowledge-album 收录）。
-- 按用户要求改为多对多：两个栏目都能查到同一篇文章。
--
-- 设计：
--   articles.category_id 保留为「主栏目」（详情页、后台编辑仍用它）；
--   article_category_links 记录文章可见的全部栏目，列表与首页按它过滤。
--
-- 回填：
--   1) 每篇文章的主栏目先入关联表
--   2) 再按「采集源 → 栏目」映射补齐：文章出现在哪个源，就关联那个源的栏目
--
-- 回滚：
--   DROP TABLE article_category_links;
--   （articles.category_id 未被修改，回滚后行为与改动前一致）

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS article_category_links (
  article_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, category_id),
  KEY idx_article_category_links_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1) 主栏目
INSERT IGNORE INTO article_category_links (article_id, category_id)
SELECT a.id, a.category_id
FROM articles a
WHERE a.category_id IS NOT NULL;

-- 2) 按采集源映射补齐（一稿多投时多个栏目都可见）
INSERT IGNORE INTO article_category_links (article_id, category_id)
SELECT i.article_id, c.id
FROM wechat_album_items i
JOIN wechat_album_sources s ON s.id = i.source_id
JOIN article_categories c ON c.slug = s.category_slug
WHERE i.article_id IS NOT NULL;
