-- 为旧站迁移文章保留可跳转的原文地址。

ALTER TABLE articles
  ADD COLUMN original_url VARCHAR(2048) NOT NULL DEFAULT '' COMMENT '原文链接';
