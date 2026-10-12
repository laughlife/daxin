-- 010_swap_wechat_before_phone.sql
--
-- @data-migration
--
-- 需求（2026-10-12）：页脚的微信放在电话上面，站点配置里的位置也一起调换。
--
-- 背景：迁移 009 建立的 general 组顺序是
--   电话 → 邮箱 → 地址 → 微信
-- 现改为
--   微信 → 电话 → 邮箱 → 地址
-- 只交换 contact_wechat 与 contact_phone 的次序：把微信提到最前（50），
-- 其余三项各后移一位（60/70/80），保持整体连续。
--
-- 为什么不直接改 009：
--   009 已经应用并写入 schema_migrations 台账。修改已应用的迁移文件会改变其
--   checksum，而不修改文件、只改库又会造成「文件与数据库不一致」的静默漂移
--   （正是 tools/check-migration-ledger.mjs 用来检测的那种问题）。
--   因此结构/数据的后续调整一律走新迁移，009 保持原样。
--
-- 重复执行安全：纯幂等 UPDATE，按 setting_key 定位。

SET NAMES utf8mb4;

UPDATE site_settings SET sort_order = 50, updated_at = NOW() WHERE setting_key = 'contact_wechat';
UPDATE site_settings SET sort_order = 60, updated_at = NOW() WHERE setting_key = 'contact_phone';
UPDATE site_settings SET sort_order = 70, updated_at = NOW() WHERE setting_key = 'contact_email';
UPDATE site_settings SET sort_order = 80, updated_at = NOW() WHERE setting_key = 'contact_address';
