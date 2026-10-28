-- 046_entity_images_and_details.sql
--
-- 需求（2026-10-28）：小程序后台的品牌/律所带多图与富文本简介。
--   entity_images  一个主体多张图（存完整 URL，不落 OSS）
--   entity_details 长文本与原始 JSON 留档，后台字段变动时不用再改表
--
-- 回滚：DROP TABLE entity_details; DROP TABLE entity_images;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS entity_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(16) NOT NULL COMMENT 'brand / law_firm',
  entity_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  image_url VARCHAR(512) NOT NULL DEFAULT '' COMMENT '完整 URL，如 /images/images/{uuid}.png',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_entity_image (entity_type, entity_id, image_url),
  KEY idx_entity_images_owner (entity_type, entity_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entity_details (
  entity_type VARCHAR(16) NOT NULL COMMENT 'brand / law_firm',
  entity_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  intro TEXT NULL COMMENT '富文本简介（对应后台 js 字段）',
  raw_json JSON NULL COMMENT '后台返回原样留档',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
