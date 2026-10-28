-- 055_entity_case_rows.sql
--
-- 需求（2026-10-28）：小程序品牌详情页的「起诉信息」表格
-- （起诉时间 / 案件号 / 代理律所 / 受理法院）作为品牌历史发案原样入库，
-- 品牌详情页最下方直接展示，不再依赖 cases 表做文本匹配。
--
-- 说明：
--   - case_number 原样保存，后台一行可能带多个案件号（顿号分隔），前台照原样显示；
--   - 每次同步按 entity_type + entity_id 先删后插，保证与小程序后台一致；
--   - 只存小程序给出的行，不在这里合并 cases 表的数据。
--
-- 回滚：DROP TABLE entity_case_rows;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS entity_case_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(16) NOT NULL COMMENT 'brand / law_firm',
  entity_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  filed_at DATE NULL DEFAULT NULL,
  case_number VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原样保留，可能一行多个案件号',
  law_firm VARCHAR(191) NOT NULL DEFAULT '',
  court VARCHAR(191) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_entity_case_rows_owner (entity_type, entity_id, sort_order),
  KEY idx_entity_case_rows_filed (entity_type, entity_id, filed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
