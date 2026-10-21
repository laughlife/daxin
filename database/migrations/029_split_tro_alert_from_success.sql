-- 029_split_tro_alert_from_success.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：把「TRO侵权预警」和「TRO成功案例」分开。
-- 用户确认：只分这两类，其他栏目（劳动纠纷/货代案例/科普干货）保持不动。
--
-- 背景：800 篇公众号文章当初全部落在四个栏目里，TRO侵权预警是 0 篇。
-- 而 tro-success 里绝大多数其实是「案件播报 / 雷区 / 被告名单」这类预警内容，
-- 真正属于「成功案例」的是胜诉、和解成功、大信帮客户拿回损失这一类。
--
-- 判定规则（按标题，正文为空是采集器现状）：
--   进「TRO侵权预警」：含 预警|名单|合集|集锦|播报|速递|被冻|冻结|沦陷|中招|被告|被诉|雷
--   留在「TRO成功案例」：含 胜诉|成功案例|拿回|驳回|免赔|0赔偿|零赔偿|和解|大信
-- 排除词优先 —— 实测「冻结」会误捞和解案例（标题写「冻结金额10%，和解金仅5000」）。
--
-- 实测：移出 345 篇，TRO侵权预警 0 → 345，TRO成功案例 520 → 175。
--
-- 回滚：
--   UPDATE articles SET category_id = 3
--   WHERE category_id = 2 AND title REGEXP '<上面的预警关键词>'
--   （即把满足预警条件、但位于 TRO侵权预警 的文章放回 TRO成功案例）
--
-- 幂等：只处理 category_id=3 的文章，重复执行不会再移动已在 2 的。

SET NAMES utf8mb4;

UPDATE articles
SET category_id = (SELECT id FROM article_categories WHERE slug = 'tro-alert'),
    updated_at = NOW()
WHERE category_id = (SELECT id FROM article_categories WHERE slug = 'tro-success')
  AND status = 'published'
  AND title REGEXP '预警|名单|合集|集锦|播报|速递|被冻|冻结|沦陷|中招|被告|被诉|雷'
  AND title NOT REGEXP '胜诉|成功案例|拿回|驳回|免赔|0赔偿|零赔偿|和解|大信';
