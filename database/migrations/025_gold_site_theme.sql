-- 025_gold_site_theme.sql
--
-- @data-migration
--
-- 需求（2026-10-20）：整体网站配色改为金色系，并把这个金色系做成后台
-- 「公开页面配色」的主题预设，便于后续统一调整。
--
-- 做法：
--   1. 前端新增预设 `royal-gold`（典雅金），并让它额外覆盖底色与文字色
--      （浅分区底改暖米色、深色底改深棕、正文改暖黑），否则会出现
--      「主色是金的、底子还是冷灰」的半吊子状态。
--   2. 本迁移把当前生效的 site_theme 指到该预设。
--
-- 为什么改 is_current=1 的那一行而不是插入新版本：
--   site_settings 的唯一键是 (setting_key, version)，插入 version+1 会留下
--   两条记录、破坏「每个 key 恰好一条 is_current=1」的约束（迁移 004 修的就是这个问题）。
--
-- 重复执行安全：纯幂等 UPDATE，按 setting_key + is_current 定位。

SET NAMES utf8mb4;

UPDATE site_settings
SET setting_value = '{"preset":"royal-gold","primary":"#8F5F18"}',
    updated_at = NOW()
WHERE setting_key = 'site_theme'
  AND is_current = 1;
