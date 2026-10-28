-- 045_mini_program_entity_fields.sql
--
-- 需求（2026-10-28）：品牌库 / 律所目录的数据改由自有小程序后台
-- （wx.daxinfawu.com:8443）采集提供，需要保存小程序侧的字段。
--
-- 说明：采集时不再拆分写入（已移除），这里补齐承载字段；
--      图片存完整 URL（https://wx.daxinfawu.com:8443/images/...），不上传 OSS。
--
-- 回滚：见文件末尾注释。

SET NAMES utf8mb4;

ALTER TABLE brands
  ADD COLUMN mp_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '小程序后台主键' AFTER id,
  ADD COLUMN ip_category VARCHAR(32) NOT NULL DEFAULT '' COMMENT '品牌分类：专利/版权/商标' AFTER name,
  ADD COLUMN lawsuit_type VARCHAR(32) NOT NULL DEFAULT '' COMMENT '起诉类型',
  ADD COLUMN brand_owner VARCHAR(191) NOT NULL DEFAULT '' COMMENT '品牌方',
  ADD COLUMN default_law_firm VARCHAR(191) NOT NULL DEFAULT '' COMMENT '列表页显示的代理律所',
  ADD COLUMN cover_url VARCHAR(512) NOT NULL DEFAULT '' COMMENT '封面图 URL',
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'import' COMMENT 'import/manual',
  ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 1,
  ADD UNIQUE KEY uk_brands_mp (mp_id);

ALTER TABLE law_firms
  ADD COLUMN mp_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '小程序后台主键' AFTER id,
  ADD COLUMN short_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '简称',
  ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT '' COMMENT '地址',
  ADD COLUMN website VARCHAR(255) NOT NULL DEFAULT '' COMMENT '官网',
  ADD COLUMN logo_url VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'Logo URL',
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'import' COMMENT 'import/manual',
  ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 1,
  ADD UNIQUE KEY uk_law_firms_mp (mp_id);

-- 回滚：
-- ALTER TABLE brands DROP INDEX uk_brands_mp;
-- ALTER TABLE brands DROP COLUMN mp_id, DROP COLUMN ip_category, DROP COLUMN lawsuit_type,
--   DROP COLUMN brand_owner, DROP COLUMN default_law_firm, DROP COLUMN cover_url,
--   DROP COLUMN source, DROP COLUMN is_published;
-- ALTER TABLE law_firms DROP INDEX uk_law_firms_mp;
-- ALTER TABLE law_firms DROP COLUMN mp_id, DROP COLUMN short_name, DROP COLUMN address,
--   DROP COLUMN website, DROP COLUMN logo_url, DROP COLUMN source, DROP COLUMN is_published;
