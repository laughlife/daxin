-- 042_case_detail_and_events.sql
--
-- 需求（2026-10-27）：抓取 worldtro 案件详情页（/case-{州}-{案件号}.html），
-- 存储详情字段与「案件进展」时间线，并用于 /tro/cases/{案件号} 页面展示。
--
-- 设计：
--   case_details  1:1，慢变字段（法院全称、被告、律所、品牌、案由、金额、解析原文）
--   case_events   1:N，按天追加的进展时间线，用 dedupe_key 去重
--   cases 表结构不变，详情通过 case_id 关联
--
-- 抓取状态记录在 case_details.fetch_status：
--   pending  待抓
--   ok       成功
--   blocked  触发站点滑块验证（当天停止，次日重试）
--   partial  抓到但字段缺失
--   missing  详情页不存在（404）
--
-- 回滚：
--   DROP TABLE case_events;
--   DROP TABLE case_details;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS case_details (
  case_id BIGINT UNSIGNED NOT NULL,
  source_url VARCHAR(512) NOT NULL DEFAULT '',
  source_case_id BIGINT UNSIGNED NULL DEFAULT NULL,
  court_full VARCHAR(191) NOT NULL DEFAULT '',
  defendants JSON NULL,
  law_firms JSON NULL,
  brands JSON NULL,
  cause_of_action VARCHAR(255) NOT NULL DEFAULT '',
  frozen_amount VARCHAR(64) NOT NULL DEFAULT '',
  claim_amount VARCHAR(64) NOT NULL DEFAULT '',
  raw_text MEDIUMTEXT NULL,
  fetch_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  fetch_error VARCHAR(255) NOT NULL DEFAULT '',
  fetched_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id),
  KEY idx_case_details_status (fetch_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  event_date DATE NULL DEFAULT NULL,
  title VARCHAR(191) NOT NULL DEFAULT '',
  description TEXT NULL,
  dedupe_key CHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_events_dedupe (case_id, dedupe_key),
  KEY idx_case_events_case (case_id, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 为已有公众号/旧站案件建立待抓记录（只针对有案件号的）
INSERT IGNORE INTO case_details (case_id, fetch_status)
SELECT c.id, 'pending' FROM cases c WHERE c.case_number <> '';
