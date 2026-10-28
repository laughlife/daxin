-- @data-migration
-- 为三个常见问题栏目增加可供后台文章管理使用的分类，并保持分类配置可重复应用。

SET NAMES utf8mb4;

INSERT INTO article_categories
  (slug, name, section, description, sort_order, status)
VALUES
  ('tro-faq', 'TRO 常见问题', 'tro', 'TRO 案件通知、应诉材料与沟通流程常见问题。', 90, 1),
  ('labor-faq', '劳动争议', 'labor', '劳动关系与企业用工管理常见问题。', 100, 1),
  ('cross-border-faq', '跨境干货', 'domestic', '跨境电商与国际物流经营中的资料准备与风险管理。', 110, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  section = VALUES(section),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  status = 1,
  updated_at = NOW();

-- 为可能已创建但尚未写入栏目关联的文章补齐关系。
INSERT IGNORE INTO article_category_links (article_id, category_id)
SELECT a.id, a.category_id
FROM articles a
JOIN article_categories c ON c.id = a.category_id
WHERE c.slug IN ('tro-faq', 'labor-faq', 'cross-border-faq');
