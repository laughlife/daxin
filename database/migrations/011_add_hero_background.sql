-- 011_add_hero_background.sql
--
-- @data-migration
--
-- 需求（2026-10-12）：把首屏那个 CSS 动态背景提取成动图，
-- 上传后配置起来，用它替换现有的纯 CSS 动态背景。
--
-- 新增两个配置：
--   home_hero_background        首屏动态背景（动画 WebP，144KB / 74 帧 / 无缝循环）
--   home_hero_background_poster 上述动图的静态首帧（JPEG 35KB），
--                               供不支持动画 WebP 的浏览器回退
--
-- 为什么同时存静帧：动画 WebP 在主流现代浏览器都支持，
-- 但为稳妥起见留一张同尺寸静帧做回退，未命中就退回原来的 CSS 渐变背景，
-- 这样任何情况下首屏都不会空掉。
--
-- 插入方式：INSERT ... SELECT ... WHERE NOT EXISTS，仅在键不存在时插入，
-- 不用 INSERT IGNORE（那会连唯一键冲突一起吞掉，掩盖问题）。
--
-- 排序：放在 home 组最前（10），然后整体后移，因为背景是整块首屏的底，
-- 在后台按「页面从上到下」阅读时它应该最先出现。

SET NAMES utf8mb4;

-- 1) 先把现有 home 组整体后移 20，给背景键腾出最前面的位置
UPDATE site_settings
SET sort_order = sort_order + 20, updated_at = NOW()
WHERE is_current = 1 AND setting_group = 'home';

-- 2) 新增两个背景键（仅当不存在时）
INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'home_hero_background', 'home', 10, '', 'image', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM site_settings WHERE setting_key = 'home_hero_background' AND is_current = 1
);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'home_hero_background_poster', 'home', 20, '', 'image', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM site_settings WHERE setting_key = 'home_hero_background_poster' AND is_current = 1
);
