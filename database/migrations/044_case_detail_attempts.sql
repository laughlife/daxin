-- 044_case_detail_attempts.sql
--
-- 需求（2026-10-27）：missing / partial 的案件需要有限次重试，避免永久放弃。
--
-- fetch_attempts：抓取尝试次数；missing 最多 2 次（间隔 7 天）、partial 最多 5 次（间隔 1 天）。
--
-- 回滚：ALTER TABLE case_details DROP COLUMN fetch_attempts;

SET NAMES utf8mb4;

ALTER TABLE case_details
  ADD COLUMN fetch_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER fetch_status;
