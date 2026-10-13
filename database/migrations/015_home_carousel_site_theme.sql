-- Seed a site-wide theme and give the logistics guide a default consultation QR.
-- Existing administrator-selected themes and non-empty logistics QR values are preserved.

SET NAMES utf8mb4;

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'site_theme', 'general', 130,
  '{"preset":"classic-red","primary":"#B91C1C"}',
  'json', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM site_settings WHERE setting_key = 'site_theme' AND is_current = 1
);

UPDATE site_settings
SET setting_value = JSON_SET(setting_value, '$[2].qrItemKey', 'qr-tro-consult'),
    updated_at = NOW()
WHERE setting_key = 'home_legal_guides'
  AND is_current = 1
  AND status = 'published'
  AND JSON_VALID(setting_value)
  AND JSON_UNQUOTE(JSON_EXTRACT(setting_value, '$[2].slug')) = 'logistics'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(setting_value, '$[2].qrItemKey')), '') = '';
