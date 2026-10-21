-- 031_home_team_intro_settings.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：后台「首页配置」里在首屏下面单独加一组「首页团队介绍」，
-- 与「关于我们」的团队介绍文案分开配置；团队介绍背景图也挪到这一组。
--
-- 此前首页团队介绍复用的是关于我们的 about_team_title / about_team_paragraphs，
-- 两个页面共用一份文案。用户要求分开，因此新增两份首页专用配置：
--   home_team_title       首页团队介绍标题（纯文本）
--   home_team_paragraphs  首页团队介绍正文（json 字符串数组）
-- 初始值从现有的 about_* 复制过来，保证上线后首页外观不变；
-- 后台分组里 home_team_background 也会从前端的「首屏」组移到「首页团队介绍」组。
--
-- 回滚：
--   DELETE FROM site_settings WHERE setting_key IN ('home_team_title', 'home_team_paragraphs');

SET NAMES utf8mb4;

INSERT INTO site_settings (setting_key, version, setting_value, value_type, media_id, is_current, created_at, updated_at)
SELECT 'home_team_title', 1,
       IFNULL((SELECT setting_value FROM (SELECT setting_value FROM site_settings WHERE setting_key = 'about_team_title' AND is_current = 1) AS t), ''),
       'text', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_title' AND is_current = 1));

INSERT INTO site_settings (setting_key, version, setting_value, value_type, media_id, is_current, created_at, updated_at)
SELECT 'home_team_paragraphs', 1,
       IFNULL((SELECT setting_value FROM (SELECT setting_value FROM site_settings WHERE setting_key = 'about_team_paragraphs' AND is_current = 1) AS t), '[]'),
       'json', NULL, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) AS d WHERE EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_team_paragraphs' AND is_current = 1));
