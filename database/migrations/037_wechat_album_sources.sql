-- @data-migration
-- 新增 CPSC、专利预警与 TRO 热点资讯公众号专辑采集源。
-- 新来源首次同步全量采集；重复应用时保留已有游标和同步状态。

INSERT INTO wechat_album_sources
  (source_key, name, album_url, category_slug, initial_mode, initial_limit, enabled)
VALUES
  ('cpsc-album', 'CPSC', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=4637464816469966849#wechat_redirect', 'cpsc-recalls', 'full', 0, 1),
  ('patent-alert-album', '专利预警', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=4551966250071261186#wechat_redirect', 'tro-alert', 'full', 0, 1),
  ('tro-hotspot-album', 'TRO热点资讯', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTM2MjI0Nw==&action=getalbum&album_id=4028684241973166092&scene=126#wechat_redirect', 'news', 'full', 0, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  album_url = VALUES(album_url),
  category_slug = VALUES(category_slug),
  initial_mode = IF(initial_synced_at IS NULL, 'full', initial_mode),
  initial_limit = IF(initial_synced_at IS NULL, 0, initial_limit),
  enabled = 1,
  updated_at = NOW();
