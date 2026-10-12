-- 008_prune_unused_settings_and_add_wechat.sql
--
-- @data-migration
--
-- 一、删除确认无用的站点配置
--
-- 依据 tools/check-setting-usage.mjs 扫描全部前端与服务端源码：
-- 下列 key 在任何代码里都没有引用（不是「值没填」，而是没有任何地方读取）。
-- 另确认它们也不在公开接口 /api/public/settings 的取值白名单里。
--
--   about_more_label / about_more_link  关于我们页用的是页面内硬编码链接
--   contact_notice                      页脚与联系区都不再展示「提示文案」
--   home_consultation_title             对应咨询组件 ConsultationCta 未被渲染
--   home_consultation_description       同上
--   home_consultation_button            同上
--   seo_home_title / seo_home_description  各页 SEO 走 useSeoMeta 与 site_description
--
-- 采用软删除（is_current = 0）而不是 DELETE：
--   site_settings 以 (setting_key, version) 为唯一键并保留历史版本，
--   置 is_current = 0 后公开接口与后台都不再返回该键，
--   效果与删除一致，但数据仍在，误删可恢复。
--
-- 二、新增 contact_wechat
--
-- 需求：general 中的电话/邮箱/地址再增加一个微信，
-- 底部「联系我们」的四个字段都改为引用配置。
-- 初始值取当前页脚展示的 TRO 咨询号，保持页面内容不变。
--
-- 重复执行安全：全部为幂等写入（UPDATE 定位 + INSERT ... SELECT WHERE NOT EXISTS）。

SET NAMES utf8mb4;

-- 1) 软删除确认无用的配置
UPDATE site_settings
SET is_current = 0, updated_at = NOW()
WHERE is_current = 1
  AND setting_key IN (
    'about_more_label',
    'about_more_link',
    'contact_notice',
    'home_consultation_title',
    'home_consultation_description',
    'home_consultation_button',
    'seo_home_title',
    'seo_home_description'
  );

-- 2) 新增 contact_wechat（仅在不存在时插入）
--    用 INSERT ... SELECT ... WHERE NOT EXISTS 而不是 INSERT IGNORE：
--    INSERT IGNORE 会连「唯一键冲突」一并吞掉，若将来该键存在多个版本会掩盖问题，
--    这里只跳过「已经有现行行」这一种情况，语义更明确。
INSERT INTO site_settings
  (setting_key, setting_group, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'contact_wechat', 'general', 'kjzx88', 'text', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM site_settings WHERE setting_key = 'contact_wechat' AND is_current = 1
);
