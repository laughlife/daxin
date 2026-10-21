-- 032_home_team_features.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：团队介绍下方那四个带圆圈对号的业务项也要做成后台可配置。
--
-- 同时修正 031 的疏漏：新增配置项必须写 setting_group，否则默认落到 general，
-- 后台对应页签里就看不到（home_team_title / home_team_paragraphs 当时就是这个原因没显示）。
-- 这里一并把这两项的 setting_group 补齐，重复执行安全。
--
-- 回滚：
--   DELETE FROM site_settings WHERE setting_key = 'home_team_features';

SET NAMES utf8mb4;

INSERT INTO site_settings (setting_key, version, setting_value, value_type, setting_group, media_id, is_current, created_at, updated_at)
SELECT 'home_team_features', 1,
       'TRO和解/应诉/起诉\n跨境知识产权服务\n涉外纠纷\n货代纠纷与劳动争议',
       'text', 'home', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT 1) AS d
  WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_features' AND is_current = 1)
);

-- 修正 031 里两项漏掉的 setting_group
UPDATE site_settings
SET setting_group = 'home', updated_at = NOW()
WHERE is_current = 1
  AND setting_key IN ('home_team_title', 'home_team_paragraphs')
  AND setting_group <> 'home';
