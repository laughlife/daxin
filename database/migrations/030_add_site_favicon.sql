-- 030_add_site_favicon.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：后台「Logo」处增加浏览器标签页图标（favicon）的配置。
-- 用户确认：指的是浏览器标签标题左边那个小图标，不是页头 logo 里的剑形标记。
--
-- 与 site_logo 同一套机制：value_type='image'，真实资源由 media_id 关联，
-- setting_value 存的是公开地址（后台保存时会同时写这两列）。
--
-- 回滚：
--   DELETE FROM site_settings WHERE setting_key = 'site_favicon';

SET NAMES utf8mb4;

INSERT INTO site_settings (setting_key, version, setting_value, value_type, media_id, is_current, created_at, updated_at)
SELECT 'site_favicon', 1, '', 'image', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT 1) AS dummy
  WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'site_favicon' AND is_current = 1)
);
