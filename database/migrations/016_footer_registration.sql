-- 016_footer_registration.sql
--
-- @data-migration
--
-- Add an editable footer registration text setting without changing existing settings.

SET NAMES utf8mb4;

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'footer_registration', 'general', 120, '', 'text', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM site_settings WHERE setting_key = 'footer_registration' AND is_current = 1
);
