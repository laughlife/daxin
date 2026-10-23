-- 首页视觉配置生产数据补丁（需人工执行，不属于 schema_migrations 自动迁移）
-- 内容：普法干货强调色，以及团队介绍标题和正文。
-- 普法干货顺序固定为 tro / labor / logistics。
--
-- 重复执行安全：仅在目标值不一致时更新；没有命中当前配置时 ROW_COUNT() 为 0。

SET NAMES utf8mb4;

-- 预检：三条当前配置应存在，且 home_legal_guides 的 json_valid 应为 1。
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

-- 核对：三个 key 的目标值正确后提交；若不正确或配置行缺失则回滚。
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
