-- 034_home_team_paragraphs_as_text.sql
--
-- @data-migration
--
-- 需求（2026-10-21）：首页团队介绍正文改为按纯文本存储，不再用 json 数组。
-- 用户明确：后台存文本，不要 json —— 之前 json 包装导致前端按字符串处理时
-- 拿到的是 ["..."] 整段，解析不出来。
--
-- 做法：把 json 数组拆成换行分隔的纯文本，并把 value_type 改为 text。
-- 前端 index.vue 已支持：字符串按行拆分渲染。
--
-- 回滚：
--   UPDATE site_settings SET value_type='json' WHERE setting_key='home_team_paragraphs' AND is_current=1;
--   （值需另行按行重新组装成 JSON 数组）

SET NAMES utf8mb4;

UPDATE site_settings
SET value_type = 'text',
    setting_value = TRIM(BOTH '"' FROM
      REPLACE(REPLACE(REPLACE(setting_value,
        '["', ''), '","', CHAR(10)), '"]', '')),
    updated_at = NOW()
WHERE setting_key = 'home_team_paragraphs'
  AND is_current = 1;
