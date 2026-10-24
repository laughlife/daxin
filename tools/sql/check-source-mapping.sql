-- 检查「采集源 → 栏目」映射是否正确（可直接在生产库执行，只读）
--
-- 用法：mysql ... < tools/sql/check-source-mapping.sql
-- 三段结果都不达标时，按下方注释处理。

-- ① 映射是否指向「存在且启用」的栏目
--   正常：栏目名有值、状态=1
--   异常：栏目名为 (栏目不存在) → 映射写错；状态=0 → 栏目被停用
SELECT s.source_key,
       s.category_slug,
       IFNULL(c.name, '(栏目不存在)') AS category_name,
       IFNULL(c.status, '-')          AS category_status,
       s.enabled                      AS source_enabled
FROM wechat_album_sources s
LEFT JOIN article_categories c ON c.slug = s.category_slug
ORDER BY s.id;

-- ② 映射与实际数据是否一致
--   正常：0
--   异常：>0 说明迁移 040 没跑，或改过映射后没有重跑关联补齐
--        （处理：重新执行 040 里的第 ② 段 INSERT IGNORE，幂等安全）
SELECT COUNT(*) AS items_missing_link
FROM wechat_album_items i
JOIN wechat_album_sources s ON s.id = i.source_id
JOIN article_categories c   ON c.slug = s.category_slug
LEFT JOIN article_category_links l
       ON l.article_id = i.article_id AND l.category_id = c.id
WHERE i.article_id IS NOT NULL
  AND l.article_id IS NULL;

-- ③ 每个源的文章数 vs 已关联数
--   正常：两列相等（0 篇的新源也相等）
--   异常：文章数 > 已关联数 → 有文章没进对应栏目
SELECT s.source_key,
       s.category_slug,
       COUNT(DISTINCT i.article_id) AS articles,
       COUNT(DISTINCT l.article_id) AS linked_in_category
FROM wechat_album_sources s
LEFT JOIN wechat_album_items i ON i.source_id = s.id AND i.article_id IS NOT NULL
LEFT JOIN article_categories c ON c.slug = s.category_slug
LEFT JOIN article_category_links l ON l.article_id = i.article_id AND l.category_id = c.id
GROUP BY s.id
ORDER BY s.id;

-- ④ 各栏目最终可见文章数（用于核对页面显示）
SELECT c.slug, c.name, COUNT(l.article_id) AS visible_articles
FROM article_categories c
LEFT JOIN article_category_links l ON l.category_id = c.id
GROUP BY c.id
ORDER BY visible_articles DESC;
