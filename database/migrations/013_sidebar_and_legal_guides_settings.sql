-- 013_sidebar_and_legal_guides_settings.sql
-- Seed configurable content-page sidebar and the three homepage legal-guide slides.
-- Existing current admin values are never overwritten; reruns are guarded by the migration runner
-- and each row also checks for a current key before insertion.

SET NAMES utf8mb4;

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'content_sidebar', 'general', 120,
  '{"faqTitle":"常见问题","faqLinks":[{"key":"tro","label":"TRO 常见问题","path":"/faq/tro","enabled":true,"sortOrder":10},{"key":"labor","label":"劳动争议","path":"/faq/labor","enabled":true,"sortOrder":20},{"key":"cross-border","label":"跨境干货","path":"/faq/cross-border","enabled":true,"sortOrder":30}],"publicHeading":"关注公众号了解咨询","consultHeading":"添加咨询号沟通案件"}',
  'json', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'content_sidebar' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'home_legal_guides', 'home', 120,
  '[{"slug":"tro","category":"跨境tro","title":"《破解TRO跨境难题》","paragraphs":["卖家最头疼的跨境困局：被美国律所起诉、店铺被锁、资金冻结、链接强制下架，若不及时处理，很可能钱店两空，我们专注各类TRO案件，提供低价和解、资金解冻、店铺解封等服务；同行搞不定的疑难案件，也能高效破局"],"image":"/images/guides/tro.png","imageAlt":"跨境 TRO 法律指南","benefit":"历年TRO侵权案例集锦","accent":"#642a86","qrItemKey":"qr-tro-consult"},{"slug":"labor","category":"劳动法","title":"《懂法用工，规避风险》","paragraphs":["还在忽视用工细节？结合近年劳动仲裁大数据，当前企业用工形势日趋严峻，核心风险集中在员工法律意识提升后离职时集中仲裁、企业因用工不规范频发高额赔付，以及事后补救困难且损害企业声誉这三点","与其事后被动应对，不如提前合规布局，以懂法用工实现风险前置管理，护航企业稳健经营"],"image":"/images/guides/labor-law.png","imageAlt":"劳动用工合规指南","benefit":"免费领取《88项用工风险自查表》","accent":"#a84d18","qrItemKey":"qr-labor-consult"},{"slug":"logistics","category":"国际物流","title":"","paragraphs":[],"image":"","imageAlt":"国际物流法律指南","benefit":"","accent":"#216695","qrItemKey":""}]',
  'json', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_legal_guides' AND is_current = 1);
