-- 首页核心业务流程卡片支持可配置图片；旧首页主视觉配置已下线。
ALTER TABLE service_sections
  ADD COLUMN image_media_id BIGINT UNSIGNED NULL AFTER summary;

UPDATE site_settings
   SET status = 'archived', updated_at = NOW()
 WHERE setting_group = 'home'
   AND is_current = 1
   AND setting_key IN (
     'home_hero_badge',
     'home_hero_title',
     'home_hero_subtitle',
     'home_hero_primary_label',
     'home_hero_primary_link',
     'home_hero_secondary_label',
     'home_hero_background',
     'home_hero_background_poster',
     'home_banner_image'
   );
