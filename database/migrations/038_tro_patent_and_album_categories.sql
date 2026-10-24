-- @data-migration
-- 新增 TRO 专利预警栏目，并修正公众号专辑来源及已采集文章的分类。
-- 重复应用时只更新分类映射，不会重置采集游标或同步状态。

INSERT INTO article_categories
  (slug, name, section, description, sort_order, status)
VALUES
  ('patent-alert', '专利预警', 'tro', '聚焦专利侵权案件动态与产品风险预警。', 25, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  section = VALUES(section),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  status = 1,
  updated_at = NOW();

UPDATE wechat_album_sources
SET category_slug = CASE source_key
      WHEN 'cpsc-album' THEN 'cpsc-recalls'
      WHEN 'patent-alert-album' THEN 'patent-alert'
      WHEN 'tro-hotspot-album' THEN 'news'
      WHEN 'tro-2025-album' THEN 'tro-alert'
      WHEN 'tro-2026-album' THEN 'tro-alert'
      WHEN 'tro-classic-album' THEN 'tro-success'
    END,
    updated_at = NOW()
WHERE source_key IN (
  'cpsc-album',
  'patent-alert-album',
  'tro-hotspot-album',
  'tro-2025-album',
  'tro-2026-album',
  'tro-classic-album'
);

-- 按来源关系同步已采集文章分类；重叠来源时优先级为 CPSC、专利预警、年度预警、经典案例、热点资讯。
UPDATE articles a
JOIN (
  SELECT wai.article_id,
    CASE
      WHEN MAX(was.source_key = 'cpsc-album') = 1 THEN 'cpsc-recalls'
      WHEN MAX(was.source_key = 'patent-alert-album') = 1 THEN 'patent-alert'
      WHEN MAX(was.source_key IN ('tro-2025-album', 'tro-2026-album')) = 1 THEN 'tro-alert'
      WHEN MAX(was.source_key = 'tro-classic-album') = 1 THEN 'tro-success'
      WHEN MAX(was.source_key = 'tro-hotspot-album') = 1 THEN 'news'
    END AS category_slug
  FROM wechat_album_items wai
  JOIN wechat_album_sources was ON was.id = wai.source_id
  WHERE wai.article_id IS NOT NULL
    AND was.source_key IN (
      'cpsc-album',
      'patent-alert-album',
      'tro-hotspot-album',
      'tro-2025-album',
      'tro-2026-album',
      'tro-classic-album'
    )
  GROUP BY wai.article_id
) mapped ON mapped.article_id = a.id
JOIN article_categories c ON c.slug = mapped.category_slug AND c.status = 1
SET a.category_id = c.id,
    a.updated_at = NOW()
WHERE a.category_id IS NULL OR a.category_id <> c.id;
