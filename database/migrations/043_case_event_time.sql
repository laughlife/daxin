-- 043_case_event_time.sql
--
-- 需求（2026-10-27）：案件进展要显示到「时分秒」。
-- worldtro 详情页的进展是「日期 时:分:秒 UTC」+ 描述两行，原来只存了日期。
--
-- 回滚：ALTER TABLE case_events DROP COLUMN event_time;

SET NAMES utf8mb4;

ALTER TABLE case_events
  ADD COLUMN event_time CHAR(8) NOT NULL DEFAULT '' AFTER event_date;
