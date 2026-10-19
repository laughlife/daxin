-- 021_worldtro_case_import.sql
-- 为公开 WorldTRO 案件列表增加来源地区与导入审计结构。
-- 仅新增字段和表，不修改或删除现有案件数据。

ALTER TABLE cases
  ADD COLUMN state_code VARCHAR(8) NOT NULL DEFAULT '' COMMENT '来源公开列表中的州/地区代码' AFTER court;

CREATE TABLE IF NOT EXISTS case_ingest_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(64) NOT NULL COMMENT '采集来源稳定标识，例如 worldtro_tro',
  external_key VARCHAR(64) NOT NULL COMMENT '来源案件号，保留来源展示格式',
  case_id BIGINT UNSIGNED NOT NULL COMMENT '本地 cases.id',
  source_url VARCHAR(768) NOT NULL DEFAULT '' COMMENT '公开来源案件页面',
  source_filed_at DATE NULL COMMENT '来源列表披露的案件日期',
  source_state VARCHAR(8) NOT NULL DEFAULT '' COMMENT '来源列表披露的州/地区代码',
  source_law_firm VARCHAR(255) NOT NULL DEFAULT '' COMMENT '来源列表披露的原告律所名称',
  source_brand VARCHAR(255) NOT NULL DEFAULT '' COMMENT '来源列表披露的原告品牌名称',
  source_ip_type VARCHAR(32) NOT NULL DEFAULT '' COMMENT '来源列表披露的侵权类型',
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次从来源列表读取时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_ingest_source_external (source_key, external_key),
  KEY idx_case_ingest_source_case (case_id),
  KEY idx_case_ingest_source_seen (source_key, last_seen_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件外部采集来源与原始字段';

CREATE TABLE IF NOT EXISTS case_ingest_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(64) NOT NULL COMMENT '采集来源稳定标识',
  scheduled_date DATE NOT NULL COMMENT 'Asia/Shanghai 调度日期',
  status VARCHAR(16) NOT NULL DEFAULT 'running' COMMENT 'running、success、failed',
  fetched_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NOT NULL DEFAULT '',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_ingest_run_day (source_key, scheduled_date),
  KEY idx_case_ingest_run_status (source_key, status, scheduled_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件每日采集任务运行记录';
