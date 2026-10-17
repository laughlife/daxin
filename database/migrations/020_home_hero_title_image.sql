-- 首页首屏主标题改用提供的效果图；管理员仍可通过站点设置的图片控件上传替换。
UPDATE site_settings
SET setting_value = '/images/home-hero-title.png',
    value_type = 'image',
    media_id = NULL,
    updated_at = NOW()
WHERE setting_key = 'home_hero_title' AND is_current = 1;
