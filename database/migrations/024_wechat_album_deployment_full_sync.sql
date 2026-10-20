-- 记录每个公众号来源是否完成过部署后全量同步，供启动时的一次性任务判重。

ALTER TABLE wechat_album_sources
  ADD COLUMN deployment_full_synced_at DATETIME NULL DEFAULT NULL
    COMMENT '部署后全量同步完成时间' AFTER initial_synced_at;
