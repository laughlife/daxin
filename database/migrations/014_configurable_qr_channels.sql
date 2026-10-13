-- 014_configurable_qr_channels.sql
-- @data-migration
-- Add separately managed public-account QR assets while preserving the two footer QR settings.
-- Seed public-account QR assets from the currently configured footer images only when absent.

SET NAMES utf8mb4;

INSERT INTO qr_assets
  (item_key, title, media_id, caption, sort_order, status, created_at, updated_at)
SELECT 'qr-tro-public', 'TRO 公众号二维码',
  (SELECT media_id FROM site_settings WHERE setting_key = 'footer_qr_primary' AND is_current = 1 ORDER BY version DESC, id DESC LIMIT 1),
  'TRO 公众号', 10, 1, NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qr_assets WHERE item_key = 'qr-tro-public');

INSERT INTO qr_assets
  (item_key, title, media_id, caption, sort_order, status, created_at, updated_at)
SELECT 'qr-labor-public', '劳动法公众号二维码',
  (SELECT media_id FROM site_settings WHERE setting_key = 'footer_qr_secondary' AND is_current = 1 ORDER BY version DESC, id DESC LIMIT 1),
  '劳动法公众号', 20, 1, NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qr_assets WHERE item_key = 'qr-labor-public');

INSERT INTO qr_assets
  (item_key, title, media_id, caption, sort_order, status, created_at, updated_at)
SELECT 'qr-tro-consult', 'TRO 咨询号二维码', NULL,
  'TRO 案件咨询', 30, 1, NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qr_assets WHERE item_key = 'qr-tro-consult');

INSERT INTO qr_assets
  (item_key, title, media_id, caption, sort_order, status, created_at, updated_at)
SELECT 'qr-labor-consult', '劳动法咨询号二维码', NULL,
  '劳动法咨询', 40, 1, NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qr_assets WHERE item_key = 'qr-labor-consult');
