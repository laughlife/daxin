-- 033_home_team_features_split.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：团队介绍下方那四项要拆成四个独立输入框，而不是一个多行文本框。
-- 多行文本框在后台只显示一个框，看不出"有几项"、也无法单独调整顺序。
--
-- 做法：新增 home_team_feature_1..4 四个单行文本配置（setting_group='home'），
-- 初始值取现在的四项；前端按 1→4 顺序渲染，留空的项自动跳过。
-- 原来的 home_team_features 保留不动，作为回退和迁移痕迹。
--
-- 回滚：
--   DELETE FROM site_settings WHERE setting_key LIKE 'home_team_feature\_%';

SET NAMES utf8mb4;

INSERT INTO site_settings (setting_key, version, setting_value, value_type, setting_group, media_id, is_current, created_at, updated_at)
SELECT 'home_team_feature_1', 1, 'TRO和解/应诉/起诉', 'text', 'home', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_feature_1' AND is_current = 1));

INSERT INTO site_settings (setting_key, version, setting_value, value_type, setting_group, media_id, is_current, created_at, updated_at)
SELECT 'home_team_feature_2', 1, '跨境知识产权服务', 'text', 'home', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_feature_2' AND is_current = 1));

INSERT INTO site_settings (setting_key, version, setting_value, value_type, setting_group, media_id, is_current, created_at, updated_at)
SELECT 'home_team_feature_3', 1, '涉外纠纷', 'text', 'home', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_feature_3' AND is_current = 1));

INSERT INTO site_settings (setting_key, version, setting_value, value_type, setting_group, media_id, is_current, created_at, updated_at)
SELECT 'home_team_feature_4', 1, '货代纠纷与劳动争议', 'text', 'home', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_feature_4' AND is_current = 1));
