-- 保存公众号专辑来源、文章去重映射与每日采集记录。
-- 每个来源首次成功同步时全量采集列表；此后定时任务只抓取游标之后新增的列表项。

CREATE TABLE IF NOT EXISTS wechat_album_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  album_url VARCHAR(2048) NOT NULL,
  category_slug VARCHAR(64) NOT NULL,
  initial_mode VARCHAR(16) NOT NULL DEFAULT 'full' COMMENT '首次同步全量，后续增量',
  initial_limit SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  cursor_message_id VARCHAR(64) NOT NULL DEFAULT '',
  cursor_item_index VARCHAR(16) NOT NULL DEFAULT '',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  initial_synced_at DATETIME NULL,
  last_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wechat_album_sources_key (source_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '微信公众号专辑采集来源';

CREATE TABLE IF NOT EXISTS wechat_album_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id BIGINT UNSIGNED NOT NULL,
  message_id VARCHAR(64) NOT NULL,
  item_index VARCHAR(16) NOT NULL,
  article_hash CHAR(64) NOT NULL COMMENT '规范化原文链接 SHA-256，用于跨专辑去重',
  article_id BIGINT UNSIGNED NULL,
  source_url VARCHAR(2048) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  cover_source_url VARCHAR(2048) NOT NULL DEFAULT '',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wechat_album_items_identity (source_id, message_id, item_index),
  KEY idx_wechat_album_items_article (article_id),
  KEY idx_wechat_album_items_source_hash (source_id, article_hash)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '公众号专辑文章与站内文章映射';

CREATE TABLE IF NOT EXISTS wechat_album_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id BIGINT UNSIGNED NOT NULL,
  scheduled_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'running' COMMENT 'running、success、failed',
  sync_mode VARCHAR(16) NOT NULL DEFAULT 'incremental',
  page_count INT UNSIGNED NOT NULL DEFAULT 0,
  fetched_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  image_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NOT NULL DEFAULT '',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wechat_album_runs_day (source_id, scheduled_date),
  KEY idx_wechat_album_runs_status (source_id, status, scheduled_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '公众号每日同步任务记录';

INSERT INTO wechat_album_sources
  (source_key, name, album_url, category_slug, initial_mode, initial_limit, enabled)
VALUES
  ('tro-2025-album', '25年TRO案例合集', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=3883682006433153042#wechat_redirect', 'tro-success', 'full', 0, 1),
  ('tro-classic-album', 'TRO经典案例', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=3886565876014923788#wechat_redirect', 'tro-success', 'full', 0, 1),
  ('tro-knowledge-album', 'TRO科普', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=3886573447337623554#wechat_redirect', 'knowledge', 'full', 0, 1),
  ('tro-2026-album', '2026年TRO侵权案例', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=4331303352379490306#wechat_redirect', 'tro-success', 'full', 0, 1),
  ('labor-public-album', '劳动法公众号', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzY0MDg4MjY2NA==&action=getalbum&album_id=4627360820476166144&subscene=159&subscene=&scenenote=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2FyDQzM5DLLtrlpVx8vvMreg&mid=2247485404&idx=1&nolastread=1#wechat_redirect', 'labor-case', 'full', 0, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  album_url = VALUES(album_url),
  category_slug = VALUES(category_slug),
  initial_mode = IF(initial_synced_at IS NULL, 'full', initial_mode),
  initial_limit = IF(initial_synced_at IS NULL, 0, initial_limit),
  enabled = 1,
  updated_at = NOW();
