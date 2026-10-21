-- 028_publish_recent_cases.sql
--
-- @data-migration
--
-- 需求（2026-10-20）：用户确认「案件草稿再发布 20 条，其余的不动」。
--
-- 背景：cases 表 2003 条里只有 3 条是 published（id 4778-4780），
-- 公开接口只返回 publish_status='published' 的记录，
-- 因此线上案件查询页此前基本是空的（只有 3 条、单页）。
--
-- 选取规则：按立案日期倒序取最近 20 条草稿（filed_at DESC, id DESC），
-- 与已有 3 条已发布案件同一时间区间（2026-10-16 ~ 2026-10-20），保持列表新鲜度。
--
-- 发布前已核对这 20 条：案号、原告、立案日期均非空，且都有品牌关联；
-- court 为空与全表 2003 条一致（该字段历史上就未回填），不会造成数据不一致。
--
-- 回滚：把下列 id 的 publish_status 改回 'draft' 即可。
--
-- 重复执行安全：纯幂等 UPDATE，已发布的记录不受影响。

SET NAMES utf8mb4;

UPDATE cases
SET publish_status = 'published',
    updated_at = NOW()
WHERE publish_status = 'draft'
  AND id IN (
    4782, 4781, 4791, 4790, 4789, 4788, 4787, 4786, 4785, 4784,
    4783, 2790, 2789, 2803, 2802, 2801, 2800, 2799, 2798, 2797
  );
