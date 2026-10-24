-- 039_move_dual_source_articles_to_knowledge.sql
--
-- @data-migration
--
-- 需求（2026-10-24）：同一篇文章同时被 tro-classic-album 与 tro-knowledge-album 收录时，
-- 应归到「科普干货」，而不是「TRO成功案例」。
--
-- 背景：微信专辑允许一篇文章出现在多个合集，采集会为每个合集各写一条
-- wechat_album_items。之前按「源 id 最小优先」，tro-classic-album(id=2) 早于
-- tro-knowledge-album(id=3)，于是这 18 篇归到了 TRO成功案例。
--
-- 规则：知识类优先——只要文章在 tro-knowledge-album 里，就归科普干货。
--
-- 回滚：按源 id 最小优先重算这 18 篇即可。

SET NAMES utf8mb4;

UPDATE articles
SET category_id = (SELECT id FROM article_categories WHERE slug = 'knowledge'),
    updated_at = NOW()
WHERE legacy_source_table = 'wechat_album'
  AND category_id <> (SELECT id FROM article_categories WHERE slug = 'knowledge')
  AND id IN (
    SELECT article_id FROM wechat_album_items
    WHERE article_id IS NOT NULL
      AND source_id = (SELECT id FROM wechat_album_sources WHERE source_key = 'tro-knowledge-album')
  );
