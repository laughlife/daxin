-- 048_widen_entity_columns.sql
--
-- 需求（2026-10-28）：实测小程序「起诉类型」字段长度超过 32（如复合表述），
-- 采集时出现 Data too long for column 'lawsuit_type'。
--
-- 回滚：ALTER TABLE brands MODIFY COLUMN lawsuit_type VARCHAR(32) NOT NULL DEFAULT '';
--       ALTER TABLE brands MODIFY COLUMN ip_category VARCHAR(32) NOT NULL DEFAULT '';

SET NAMES utf8mb4;

ALTER TABLE brands
  MODIFY COLUMN lawsuit_type VARCHAR(64) NOT NULL DEFAULT '' COMMENT '起诉类型',
  MODIFY COLUMN ip_category VARCHAR(64) NOT NULL DEFAULT '' COMMENT '品牌分类：专利/版权/商标';
