-- 006_reclassify_labor_articles.sql
--
-- @data-migration
--
-- 修正旧库「干货知识」栏目的分类错误。
--
-- 背景：迁移脚本把旧库 project_id=11（栏目名「干货知识」）整体映射成 knowledge 分类。
-- 但该栏目下 9 篇文章全部是劳动法主题：
--   用人单位在员工试用期要不要签订劳动合同 / 员工的试用期是不是想要设多久就可以设多久 /
--   试用期间劳动者的工资多少可以随意制定吗 / 试用期内能以不能胜任为理由解聘员工吗 /
--   员工自愿放弃社保，公司竟然无责 / 出差在酒店KTV唱歌后回房间猝死算不算工伤 /
--   在公司工作期间无故打架受伤，算不算工伤 / 请病假未批，不去上班算旷工吗 /
--   员工经济补偿年限不一定是最多12年，还有可能更高
-- 因此应归入 labor-case（劳动法案例），而不是 knowledge（干货知识）。
--
-- 影响：前台「劳动法案例」栏目此前为空、而「干货知识」栏目里出现劳动法文章，是可见的分类错误。
-- 后台也已提供文章分类编辑，此处是迁移数据的批量纠正。
--
-- 幂等：只更新仍错误地挂在 knowledge 下的这 9 篇（按旧库来源 ID 精确定位），重复执行无副作用。

SET NAMES utf8mb4;

UPDATE articles a
JOIN article_categories target ON target.slug = 'labor-case'
JOIN article_categories wrong ON wrong.slug = 'knowledge'
SET a.category_id = target.id,
    a.updated_at = NOW()
WHERE a.legacy_source_table = 'cn_list'
  AND a.legacy_source_id IN (29, 75, 76, 77, 78, 79, 80, 81, 82)
  AND a.category_id = wrong.id;
