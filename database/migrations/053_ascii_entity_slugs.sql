-- 053_ascii_entity_slugs.sql
--
-- 需求（2026-10-28）：品牌详情地址改为纯 ASCII，避免中文 slug 在浏览器/分享里变成
-- 一长串百分号编码（/brands/%E6%97%8B%E9%92%AE...）。
--
-- 规则：品牌 → brand-{mp_id}，律所 → firm-{mp_id}。mp_id 唯一，slug 天然不冲突。
-- 关联表用 ID 关联，页面链接均从库里读 slug，改完自动生效。
--
-- 回滚：无法自动还原（旧 slug 含中文，未保留备份）。如需回滚请从采集侧重新生成。

SET NAMES utf8mb4;

UPDATE brands
SET slug = CONCAT('brand-', mp_id), updated_at = NOW()
WHERE mp_id IS NOT NULL;

UPDATE law_firms
SET slug = CONCAT('firm-', mp_id), updated_at = NOW()
WHERE mp_id IS NOT NULL;
