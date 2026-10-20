-- 027_gold_legal_guide_accents.sql
--
-- @data-migration
--
-- 需求（2026-10-20）：整体配色改为金色系，全站统一。
--
-- 背景：首页「普法干货」三个轮播的强调色是写死在配置数据里的
--   tro        #642a86（商务紫）
--   labor      #a84d18（橙）
--   logistics  #216695（蓝）
-- 组件已把**兜底**强调色改为跟随主题主色，但真实取值来自这里的 accent，
-- 因此在金色主题下仍会串出紫/蓝，属于「配色没改干净」。
--
-- 做法：把三个 accent 换成同一金色家族的三档，
-- 既与主题协调，又保留「每个主题各有一点区分度」的原有设计。
--
-- 顺序依赖：JSON_REPLACE 按数组下标定位。当前顺序固定为 tro / labor / logistics，
-- 应用后请用下面的核对语句确认 slug 与 accent 的对应关系正确。
--
-- 重复执行安全：对相同值重复执行结果不变。

SET NAMES utf8mb4;

UPDATE site_settings
SET setting_value = JSON_REPLACE(
      setting_value,
      '$[0].accent', '#8F5F18',   -- tro：主题主色
      '$[1].accent', '#A9752A',   -- labor：偏亮的暖金
      '$[2].accent', '#7A5216'    -- logistics：偏深的古铜金
    ),
    updated_at = NOW()
WHERE setting_key = 'home_legal_guides'
  AND is_current = 1;
