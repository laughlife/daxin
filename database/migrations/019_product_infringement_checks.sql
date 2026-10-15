-- 019_product_infringement_checks.sql
--
-- 产品侵权检测访客提交的独立记录表；不修改现有内容或迁移数据。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS product_infringement_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  brand_name VARCHAR(120) NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(80) NOT NULL,
  contact_method VARCHAR(120) NOT NULL,
  remark TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_infringement_checks_created (created_at, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '产品侵权检测提交记录';
