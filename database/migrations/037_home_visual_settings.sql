-- 037_home_visual_settings.sql
--
-- @data-migration
--
-- 需求（2026-10-21 至 2026-10-23）：
--   1. 首页「普法干货」三项强调色恢复为紫、橙、蓝；
--   2. 首页团队介绍标题与正文采用最终确认文案。
--
-- 重复执行安全：只在目标值不一致时更新；每次更新当前配置行并递增版本。
-- 普法干货顺序固定为 tro / labor / logistics。

SET NAMES utf8mb4;

-- 预检：应查到这三条当前配置；home_legal_guides 的 json_valid 应为 1。
SELECT setting_key, value_type, version, status, is_current,
       JSON_VALID(setting_value) AS json_valid
FROM site_settings
WHERE setting_key IN (
  'home_legal_guides',
  'home_team_title',
  'home_team_paragraphs'
)
  AND is_current = 1
ORDER BY setting_key, version DESC;

START TRANSACTION;

-- TRO 紫色、劳动法橙色、国际物流蓝色。
UPDATE site_settings
SET setting_group = 'home',
    setting_value = JSON_SET(
      setting_value,
      '$[0].accent', '#642a86',
      '$[1].accent', '#a84d18',
      '$[2].accent', '#216695'
    ),
    value_type = 'json',
    media_id = NULL,
    version = version + 1,
    status = 'published',
    is_current = 1,
    updated_at = NOW()
WHERE setting_key = 'home_legal_guides'
  AND is_current = 1
  AND JSON_VALID(setting_value) = 1
  AND (
    NOT (JSON_UNQUOTE(JSON_EXTRACT(setting_value, '$[0].accent')) <=> '#642a86')
    OR NOT (JSON_UNQUOTE(JSON_EXTRACT(setting_value, '$[1].accent')) <=> '#a84d18')
    OR NOT (JSON_UNQUOTE(JSON_EXTRACT(setting_value, '$[2].accent')) <=> '#216695')
  )
ORDER BY version DESC, id ASC
LIMIT 1;

SELECT ROW_COUNT() AS home_legal_guides_updated;

UPDATE site_settings
SET setting_group = 'home',
    setting_value = '大信法务团队',
    value_type = 'text',
    media_id = NULL,
    version = version + 1,
    status = 'published',
    is_current = 1,
    updated_at = NOW()
WHERE setting_key = 'home_team_title'
  AND is_current = 1
  AND NOT (setting_value <=> '大信法务团队')
ORDER BY version DESC, id ASC
LIMIT 1;

SELECT ROW_COUNT() AS home_team_title_updated;

UPDATE site_settings
SET setting_group = 'home',
    setting_value = '成立于2019年，深耕法律行业多年，汇聚国内外实力律师，专注跨境法律实战，为跨境企业、卖家及供应链提供全链路、跨法域、高实效的法律顾问服务',
    value_type = 'text',
    media_id = NULL,
    version = version + 1,
    status = 'published',
    is_current = 1,
    updated_at = NOW()
WHERE setting_key = 'home_team_paragraphs'
  AND is_current = 1
  AND NOT (setting_value <=> '成立于2019年，深耕法律行业多年，汇聚国内外实力律师，专注跨境法律实战，为跨境企业、卖家及供应链提供全链路、跨法域、高实效的法律顾问服务')
ORDER BY version DESC, id ASC
LIMIT 1;

SELECT ROW_COUNT() AS home_team_paragraphs_updated;

-- 核对：三个 key 的目标值正确后执行 COMMIT；若不正确或目标行缺失，执行 ROLLBACK。
SELECT setting_key, setting_value, value_type, version, status, is_current
FROM site_settings
WHERE setting_key IN (
  'home_legal_guides',
  'home_team_title',
  'home_team_paragraphs'
)
  AND is_current = 1
ORDER BY setting_key, version DESC;

-- COMMIT;
-- ROLLBACK;
