-- 026_home_team_intro_and_core_business.sql
--
-- 需求（2026-10-20）：
--   1. 团队介绍改成「一整张背景图 + 图上左侧放介绍」，原来的右侧四个业务块移出；
--   2. 核心业务移到团队介绍下方，按 01-05 横向展开面板重做，内容按需求文档替换。
--
-- 因此需要：
--   A. 新增配置 home_team_background（背景图，走 media_id 与 value_type=image，
--      与 site_logo / home_hero_background 的存法一致）。
--   B. 把 service_sections / service_items 的内容改成需求文档给的 5 个板块。
--      这部分数据由后台「团队业务范围」维护，所以改数据而不是改代码，
--      运营后续仍可自行增删改。
--
-- 注意：service_items 的历史 slug 与标题语义并不完全对应
--   （例如 compliance-ca65 的实际标题是「不侵权报告」）。
--   这里一律按**已存在的 slug** 定位，只改 title / sort_order，
--   不按 slug 名猜语义、也不改 slug，避免破坏已有引用。
--
-- 重复执行安全：全部按 slug / setting_key 定位的幂等语句。

SET NAMES utf8mb4;

/* ---------- A. 团队介绍背景图 ---------- */

INSERT INTO site_settings (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, status, is_current, note)
VALUES ('home_team_background', 'home', 15, '', 'image', NULL, 1, 'published', 1, '首页团队介绍背景图')
ON DUPLICATE KEY UPDATE
  setting_group = VALUES(setting_group),
  sort_order = VALUES(sort_order),
  value_type = VALUES(value_type);

/* ---------- B. 核心业务五个板块 ---------- */

UPDATE service_sections
SET title = 'TRO 业务',
    summary = '和解、起诉、应诉，全流程处理美国 TRO 临时限制令。',
    sort_order = 10,
    updated_at = NOW()
WHERE slug = 'team-tro';

UPDATE service_sections
SET title = '知识产权服务',
    summary = '覆盖亚马逊申诉、不侵权报告、链接投诉及商标版权专利注册。',
    sort_order = 20,
    updated_at = NOW()
WHERE slug = 'team-ip';

UPDATE service_sections
SET title = '涉外纠纷',
    summary = '处理跨境经营中的产品合规、恶意索赔与专利中立评估争议。',
    sort_order = 30,
    updated_at = NOW()
WHERE slug = 'team-disputes';

UPDATE service_sections
SET title = '货代纠纷与劳动争议',
    summary = '覆盖劳动人事、跨境物流、货代民商纠纷及企业法律顾问。',
    sort_order = 40,
    updated_at = NOW()
WHERE slug = 'team-cross-border';

-- 05 全周期法律护航：需求文档新增的板块
INSERT INTO service_sections (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status)
VALUES ('team-lifecycle', '全周期法律护航', '', '定期复盘、策略动态优化、成果可视化，把法律服务贯穿经营全周期。', 'shield', '', 0, 50, 1)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  summary = VALUES(summary),
  sort_order = VALUES(sort_order),
  status = 1;

/* ---------- 细项：按需求文档逐条对齐 ---------- */

-- 01 TRO 业务：需求文档只列和解 / 起诉 / 应诉
UPDATE service_items SET title = '和解', sort_order = 10, status = 1, updated_at = NOW() WHERE slug = 'overseas-tro-settle';
UPDATE service_items SET title = '起诉', sort_order = 20, status = 1, updated_at = NOW() WHERE slug = 'overseas-tro-sue';
UPDATE service_items SET title = '应诉', sort_order = 30, status = 1, updated_at = NOW() WHERE slug = 'overseas-tro-defend';
-- 原「链接维权下架」需求文档未列，置为下架而不是物理删除，运营可在后台恢复
UPDATE service_items SET status = 0, updated_at = NOW() WHERE slug = 'overseas-tro-link';

-- 02 知识产权服务
UPDATE service_items SET title = '亚马逊申诉', sort_order = 10, updated_at = NOW() WHERE slug = 'compliance-amazon';
UPDATE service_items SET title = '不侵权报告', sort_order = 20, updated_at = NOW() WHERE slug = 'compliance-ca65';
UPDATE service_items SET title = '链接投诉', sort_order = 30, updated_at = NOW() WHERE slug = 'compliance-cpsc';
UPDATE service_items SET title = '商标/版权/专利注册', sort_order = 40, updated_at = NOW() WHERE slug = 'compliance-ip';

-- 03 涉外纠纷
UPDATE service_items SET title = '加州 65 号法案', sort_order = 10, updated_at = NOW() WHERE slug = 'advisor-annual';
UPDATE service_items SET title = 'CPSC 产品召回', sort_order = 20, updated_at = NOW() WHERE slug = 'advisor-labor';
UPDATE service_items SET title = '恶意索赔处理', sort_order = 30, updated_at = NOW() WHERE slug = 'advisor-equity';
UPDATE service_items SET title = '亚马逊 APEX 专利中立评估', sort_order = 40, updated_at = NOW() WHERE slug = 'advisor-private';

-- 04 货代纠纷与劳动争议：标题本已一致，仅校正顺序
UPDATE service_items SET sort_order = 10, updated_at = NOW() WHERE slug = 'dispute-logistics';
UPDATE service_items SET sort_order = 20, updated_at = NOW() WHERE slug = 'dispute-ecommerce';
UPDATE service_items SET sort_order = 30, updated_at = NOW() WHERE slug = 'dispute-contract';
UPDATE service_items SET sort_order = 40, updated_at = NOW() WHERE slug = 'dispute-document';

-- 05 全周期法律护航：细项来自需求文档表格里的三句
INSERT INTO service_items (section_id, slug, title, summary, icon_key, link_path, sort_order, status)
SELECT ss.id, 'lifecycle-review', '定期复盘', NULL, '', '', 10, 1 FROM service_sections ss WHERE ss.slug = 'team-lifecycle'
ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order), status = 1;

INSERT INTO service_items (section_id, slug, title, summary, icon_key, link_path, sort_order, status)
SELECT ss.id, 'lifecycle-optimize', '策略动态优化', NULL, '', '', 20, 1 FROM service_sections ss WHERE ss.slug = 'team-lifecycle'
ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order), status = 1;

INSERT INTO service_items (section_id, slug, title, summary, icon_key, link_path, sort_order, status)
SELECT ss.id, 'lifecycle-visualize', '成果可视化', NULL, '', '', 30, 1 FROM service_sections ss WHERE ss.slug = 'team-lifecycle'
ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order), status = 1;
