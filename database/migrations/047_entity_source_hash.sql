-- 047_entity_source_hash.sql
--
-- 需求（2026-10-28）：小程序数据每班次增量同步，需要判断「列表字段是否变化」，
-- 用于决定是否重新抓详情。
--
-- source_hash：列表接口返回的关注字段（名称/品牌方/律所/分类/起诉类型/简介）的 md5。
-- 详情字段（图片、富文本）的变化无法从列表看出，靠滚动刷新覆盖。
--
-- 回滚：ALTER TABLE brands DROP COLUMN source_hash;
--       ALTER TABLE law_firms DROP COLUMN source_hash;

SET NAMES utf8mb4;

ALTER TABLE brands
  ADD COLUMN source_hash CHAR(32) NOT NULL DEFAULT '' COMMENT '列表字段指纹' AFTER source,
  ADD COLUMN detail_synced_at DATETIME NULL DEFAULT NULL COMMENT '详情最后同步时间' AFTER source_hash;

ALTER TABLE law_firms
  ADD COLUMN source_hash CHAR(32) NOT NULL DEFAULT '' COMMENT '列表字段指纹' AFTER source,
  ADD COLUMN detail_synced_at DATETIME NULL DEFAULT NULL COMMENT '详情最后同步时间' AFTER source_hash;
