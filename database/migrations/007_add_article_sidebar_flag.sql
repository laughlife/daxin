-- 007_add_article_sidebar_flag.sql
--
-- 后台「侧边栏管理」需要把文章标记为「在侧边栏显示」。
--
-- 为什么新增字段而不复用 is_featured：
--   is_featured 的语义是「推荐」，前台文章列表已用它显示「推荐」角标；
--   侧边栏显示是另一个含义（决定是否进入首页侧栏的推荐阅读）。
--   复用会让两个语义纠缠：想上侧边栏就必须同时被打上「推荐」角标，
--   取消推荐又会把文章从侧边栏踢掉。因此单独加一个显式标记。
--
-- 幂等性说明：
--   MySQL 8.4 的 ADD COLUMN 不支持 IF NOT EXISTS。
--   这里的幂等由迁移台账（schema_migrations）保证：同一版本只会执行一次。
--   注意：若用 --force 重放全部迁移，ADD COLUMN 会因列已存在而报错，
--   这是刻意的——让操作者显式处理，而不是悄悄跳过 schema 变更。
--
-- 索引按项目约定放进 @if-index-missing 条件块：
--   schema-check 要求独立的 CREATE INDEX 必须可重复执行，
--   直接写 CREATE INDEX 会在重放时因索引已存在而失败。

SET NAMES utf8mb4;

ALTER TABLE articles
  ADD COLUMN show_in_sidebar TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '是否在首页侧栏「推荐阅读」中显示：1 显示、0 不显示'
    AFTER is_featured;

-- 侧边栏查询按该标记过滤，加索引避免全表扫描
-- @if-index-missing idx_articles_show_in_sidebar
CREATE INDEX idx_articles_show_in_sidebar ON articles (show_in_sidebar, published_at);
-- @end-if-index-missing
