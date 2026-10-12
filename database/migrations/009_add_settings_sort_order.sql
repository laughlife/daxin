-- 009_add_settings_sort_order.sql
--
-- 一、新增 site_settings.sort_order，让后台字段按「前台页面从上到下的显示顺序」排列
--
-- 现状：settings.get.ts 用 `ORDER BY s.setting_key`，即**按字母序**，
-- 与页面实际顺序无关（例如首页先显示 badge 再 title，字母序却是 title 在前）。
--
-- 为什么不把顺序写在前端常量里：
--   排序是「这一组配置怎么展示」的数据属性，写在库里边可以直接调，
--   不需要改代码重新发版；前端硬编码则会出现「库里有新键但前端漏配」的静默问题。
--   所以加列，并由接口 ORDER BY sort_order, setting_key（第二关键字保证确定性）。
--
-- sort_order 的含义：同一 setting_group 内，**数字小的先显示**。
-- 取值按下表，依据是各页面模板里字段出现的先后。
--
-- 二、删除 about_success_category
--
-- 该键前台从未渲染（成功案例区块早已按旧站改为图片列表，不再按文章分类取数），
-- 用户确认删除。同时移除 aboutContent.ts 里对应的 successCategory 字段。
-- 采用软删除（is_current = 0），与迁移 008 一致，误删可恢复。

SET NAMES utf8mb4;

-- 1) 新增排序列
--    幂等由迁移台账保证（ADD COLUMN 不支持 IF NOT EXISTS）。
ALTER TABLE site_settings
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT '同组内展示顺序，数字小的先显示；0 表示未显式指定'
    AFTER setting_group;

-- 2) 为已存在的字段建立索引，后台按组查询时走索引
-- @if-index-missing idx_site_settings_group_sort
CREATE INDEX idx_site_settings_group_sort ON site_settings (setting_group, is_current, sort_order);
-- @end-if-index-missing

-- 3) 首页（home）显示顺序：
--    首屏 badge → title → subtitle → 主按钮文案 → 主按钮链接 → 次按钮
--    → Banner 图 → 团队介绍右侧图 → 数据概览
UPDATE site_settings SET sort_order = 10, updated_at = NOW() WHERE setting_key = 'home_hero_badge';
UPDATE site_settings SET sort_order = 20, updated_at = NOW() WHERE setting_key = 'home_hero_title';
UPDATE site_settings SET sort_order = 30, updated_at = NOW() WHERE setting_key = 'home_hero_subtitle';
UPDATE site_settings SET sort_order = 40, updated_at = NOW() WHERE setting_key = 'home_hero_primary_label';
UPDATE site_settings SET sort_order = 50, updated_at = NOW() WHERE setting_key = 'home_hero_primary_link';
UPDATE site_settings SET sort_order = 60, updated_at = NOW() WHERE setting_key = 'home_hero_secondary_label';
UPDATE site_settings SET sort_order = 70, updated_at = NOW() WHERE setting_key = 'home_banner_image';
UPDATE site_settings SET sort_order = 80, updated_at = NOW() WHERE setting_key = 'home_right_image';
UPDATE site_settings SET sort_order = 90, updated_at = NOW() WHERE setting_key = 'home_stats';

-- 4) 关于我们（about）显示顺序：
--    首屏欢迎语 → 公司名 → 简介正文 → 首图 → 团队标题 → 团队段落 → 联系标题
--    → 业务图 → 成功案例标题 → 成功案例图 → 宣讲标题 → 宣讲图
--    → 小伙伴标题 → 小伙伴图 → 荣誉图（当前页面未渲染，排在最后）
UPDATE site_settings SET sort_order = 10, updated_at = NOW() WHERE setting_key = 'about_hero_welcome';
UPDATE site_settings SET sort_order = 20, updated_at = NOW() WHERE setting_key = 'about_hero_title';
UPDATE site_settings SET sort_order = 30, updated_at = NOW() WHERE setting_key = 'about_hero_paragraph';
UPDATE site_settings SET sort_order = 40, updated_at = NOW() WHERE setting_key = 'about_hero_image';
UPDATE site_settings SET sort_order = 50, updated_at = NOW() WHERE setting_key = 'about_team_title';
UPDATE site_settings SET sort_order = 60, updated_at = NOW() WHERE setting_key = 'about_team_paragraphs';
UPDATE site_settings SET sort_order = 70, updated_at = NOW() WHERE setting_key = 'about_contact_title';
UPDATE site_settings SET sort_order = 80, updated_at = NOW() WHERE setting_key = 'about_business_images';
UPDATE site_settings SET sort_order = 90, updated_at = NOW() WHERE setting_key = 'about_success_title';
UPDATE site_settings SET sort_order = 100, updated_at = NOW() WHERE setting_key = 'about_success_images';
UPDATE site_settings SET sort_order = 110, updated_at = NOW() WHERE setting_key = 'about_lecture_title';
UPDATE site_settings SET sort_order = 120, updated_at = NOW() WHERE setting_key = 'about_lecture_images';
UPDATE site_settings SET sort_order = 130, updated_at = NOW() WHERE setting_key = 'about_partner_title';
UPDATE site_settings SET sort_order = 140, updated_at = NOW() WHERE setting_key = 'about_partner_images';
UPDATE site_settings SET sort_order = 150, updated_at = NOW() WHERE setting_key = 'about_honors_images';
-- about_team_image 是 about_hero_image 的兼容回退，前台不单独展示，紧跟在首图之后
UPDATE site_settings SET sort_order = 45, updated_at = NOW() WHERE setting_key = 'about_team_image';

-- 5) 站点信息（general）显示顺序：
--    品牌（名称 → logo → 副标题 → 描述）→ 页脚「联系我们」四项
--    （电话 → 邮箱 → 地址 → 微信，与页脚从上到下一致）
UPDATE site_settings SET sort_order = 10, updated_at = NOW() WHERE setting_key = 'site_name';
UPDATE site_settings SET sort_order = 20, updated_at = NOW() WHERE setting_key = 'site_logo';
UPDATE site_settings SET sort_order = 30, updated_at = NOW() WHERE setting_key = 'site_subtitle';
UPDATE site_settings SET sort_order = 40, updated_at = NOW() WHERE setting_key = 'site_description';
UPDATE site_settings SET sort_order = 50, updated_at = NOW() WHERE setting_key = 'contact_phone';
UPDATE site_settings SET sort_order = 60, updated_at = NOW() WHERE setting_key = 'contact_email';
UPDATE site_settings SET sort_order = 70, updated_at = NOW() WHERE setting_key = 'contact_address';
UPDATE site_settings SET sort_order = 80, updated_at = NOW() WHERE setting_key = 'contact_wechat';

-- 6) 删除 about_success_category（前台未渲染，用户确认删除）
UPDATE site_settings
SET is_current = 0, updated_at = NOW()
WHERE is_current = 1 AND setting_key = 'about_success_category';
