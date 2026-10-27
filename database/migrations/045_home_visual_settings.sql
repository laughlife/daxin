-- 045_home_visual_settings.sql
-- @data-migration
-- 首页区块背景与核心业务/核心优势图片转为后台配置。
-- 仅补充当前不存在的配置，保留数据库中已有的运营值。

SET NAMES utf8mb4;

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_stats_background', 'home', 200, '/images/backgrounds/home-stats-wave.png', 'image', NULL, 1, 'published', 1, '首页8年数据区块背景图', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_stats_background' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_background', 'home', 210, '/images/backgrounds/site-background-warm.png', 'image', NULL, 1, 'published', 1, '首页核心业务区块背景图', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_background' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantages_background', 'home', 220, '/images/backgrounds/core-advantages-wave.png', 'image', NULL, 1, 'published', 1, '首页核心优势区块背景图', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantages_background' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_legal_guides_background', 'home', 230, '/images/backgrounds/legal-guides-faceted.png', 'image', NULL, 1, 'published', 1, '首页普法干货区块背景图', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_legal_guides_background' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_cover_1', 'home', 240, '/images/services/core-business/01-tro-business.jpg', 'image', NULL, 1, 'published', 1, '首页核心业务封面图一', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_cover_1' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_cover_2', 'home', 250, '/images/services/core-business/02-ip.jpg', 'image', NULL, 1, 'published', 1, '首页核心业务封面图二', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_cover_2' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_cover_3', 'home', 260, '/images/services/core-business/03-disputes.jpg', 'image', NULL, 1, 'published', 1, '首页核心业务封面图三', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_cover_3' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_cover_4', 'home', 270, '/images/services/core-business/04-freight-labor.jpg', 'image', NULL, 1, 'published', 1, '首页核心业务封面图四', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_cover_4' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_business_cover_5', 'home', 280, '/images/services/core-business/05-lifecycle.jpg', 'image', NULL, 1, 'published', 1, '首页核心业务封面图五', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_business_cover_5' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_cover_1', 'home', 290, '/images/icons/core-advantage-team.png', 'image', NULL, 1, 'published', 1, '首页核心优势封面图一', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_cover_1' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_cover_2', 'home', 300, '/images/icons/core-advantage-experience.png', 'image', NULL, 1, 'published', 1, '首页核心优势封面图二', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_cover_2' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_cover_3', 'home', 310, '/images/icons/core-advantage-efficiency.png', 'image', NULL, 1, 'published', 1, '首页核心优势封面图三', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_cover_3' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_cover_4', 'home', 320, '/images/icons/core-advantage-protection.png', 'image', NULL, 1, 'published', 1, '首页核心优势封面图四', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_cover_4' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_cover_5', 'home', 330, '', 'image', NULL, 1, 'published', 1, '首页核心优势封面图五', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_cover_5' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_expanded_1', 'home', 340, '/images/icons/core-advantage-expanded-team.png', 'image', NULL, 1, 'published', 1, '首页核心优势展开图一', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_expanded_1' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_expanded_2', 'home', 350, '/images/icons/core-advantage-expanded-experience.png', 'image', NULL, 1, 'published', 1, '首页核心优势展开图二', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_expanded_2' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_expanded_3', 'home', 360, '/images/icons/core-advantage-expanded-efficiency.png', 'image', NULL, 1, 'published', 1, '首页核心优势展开图三', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_expanded_3' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_expanded_4', 'home', 370, '/images/icons/core-advantage-expanded-protection.png', 'image', NULL, 1, 'published', 1, '首页核心优势展开图四', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_expanded_4' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note, created_at, updated_at)
SELECT 'home_core_advantage_expanded_5', 'home', 380, '', 'image', NULL, 1, 'published', 1, '首页核心优势展开图五', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantage_expanded_5' AND is_current = 1);
