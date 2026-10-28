-- @data-migration
-- 核心优势目前只有四项，停用第五组空图片配置。
-- 新增核心优势后，后台上传会按需创建对应的 site_settings 当前配置。
-- 保留非空图片和历史版本；重复执行不会重复修改。

UPDATE site_settings
SET is_current = 0,
    updated_at = NOW()
WHERE setting_key IN (
  'home_core_advantage_cover_5',
  'home_core_advantage_expanded_5'
)
  AND is_current = 1
  AND COALESCE(TRIM(setting_value), '') = ''
  AND media_id IS NULL;
