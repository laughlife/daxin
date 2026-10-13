-- 012_home_about_footer_cleanup.sql
--
-- @data-migration
--
-- 首页团队业务、核心优势、页脚配置与已确认废弃配置收敛。

SET NAMES utf8mb4;

-- 1) 退役已不再展示的配置：保留历史版本，但取消当前生效状态。
UPDATE site_settings
SET is_current = 0, status = 'archived', updated_at = NOW()
WHERE setting_key IN ('home_right_image', 'about_hero_paragraph', 'about_business_images')
  AND is_current = 1;

-- 2) 首页团队业务配置。沿用现有四个板块记录，统一为新的公开标识与文案。
UPDATE service_sections SET slug = 'team-tro', title = 'TRO全流程处理', subtitle = '',
  summary = '和解、起诉、应诉，全流程处理美国 TRO 临时限制令。',
  icon_key = 'scale', link_path = '/tro/success-cases', show_detail_link = 1,
  sort_order = 10, status = 1, updated_at = NOW()
WHERE slug IN ('overseas-tro', 'team-tro');

UPDATE service_sections SET slug = 'team-ip', title = '跨境知识产权服务', subtitle = '',
  summary = '覆盖亚马逊申诉、不侵权报告、链接投诉及商标版权专利注册。',
  icon_key = 'shield', link_path = '', show_detail_link = 0,
  sort_order = 20, status = 1, updated_at = NOW()
WHERE slug IN ('overseas-compliance', 'team-ip');

UPDATE service_sections SET slug = 'team-disputes', title = '涉外纠纷', subtitle = '',
  summary = '处理跨境经营中的产品合规、索赔与专利评估争议。',
  icon_key = 'briefcase', link_path = '', show_detail_link = 0,
  sort_order = 30, status = 1, updated_at = NOW()
WHERE slug IN ('domestic-advisor', 'team-disputes');

UPDATE service_sections SET slug = 'team-cross-border', title = '跨境纠纷与劳动争议', subtitle = '',
  summary = '覆盖劳动人事、跨境物流、货代民商纠纷及企业法律顾问。',
  icon_key = 'document', link_path = '', show_detail_link = 0,
  sort_order = 40, status = 1, updated_at = NOW()
WHERE slug IN ('domestic-disputes', 'team-cross-border');

-- 若历史库缺少板块，则按稳定 slug 补齐。
INSERT INTO service_sections (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status)
SELECT 'team-tro', 'TRO全流程处理', '', '和解、起诉、应诉，全流程处理美国 TRO 临时限制令。', 'scale', '/tro/success-cases', 1, 10, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM service_sections WHERE slug = 'team-tro');
INSERT INTO service_sections (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status)
SELECT 'team-ip', '跨境知识产权服务', '', '覆盖亚马逊申诉、不侵权报告、链接投诉及商标版权专利注册。', 'shield', '', 0, 20, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM service_sections WHERE slug = 'team-ip');
INSERT INTO service_sections (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status)
SELECT 'team-disputes', '涉外纠纷', '', '处理跨境经营中的产品合规、索赔与专利评估争议。', 'briefcase', '', 0, 30, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM service_sections WHERE slug = 'team-disputes');
INSERT INTO service_sections (slug, title, subtitle, summary, icon_key, link_path, show_detail_link, sort_order, status)
SELECT 'team-cross-border', '跨境纠纷与劳动争议', '', '覆盖劳动人事、跨境物流、货代民商纠纷及企业法律顾问。', 'document', '', 0, 40, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM service_sections WHERE slug = 'team-cross-border');

-- 3) 复用现有子项稳定 slug，清理旧展示项并写入新标题。
UPDATE service_items SET title = '和解', sort_order = 10, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-tro') WHERE slug = 'overseas-tro-settle';
UPDATE service_items SET title = '起诉', sort_order = 20, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-tro') WHERE slug = 'overseas-tro-sue';
UPDATE service_items SET title = '应诉', sort_order = 30, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-tro') WHERE slug = 'overseas-tro-defend';
UPDATE service_items SET status = 0, section_id = (SELECT id FROM service_sections WHERE slug = 'team-tro') WHERE slug = 'overseas-tro-link';

UPDATE service_items SET title = '亚马逊申诉/投诉', sort_order = 10, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-ip') WHERE slug = 'compliance-amazon';
UPDATE service_items SET title = '不侵权报告', sort_order = 20, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-ip') WHERE slug = 'compliance-ca65';
UPDATE service_items SET title = '链接投诉', sort_order = 30, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-ip') WHERE slug = 'compliance-cpsc';
UPDATE service_items SET title = '商标/版权/专利申请注册', sort_order = 40, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-ip') WHERE slug = 'compliance-ip';

UPDATE service_items SET title = '加州65号法案', sort_order = 10, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-disputes') WHERE slug = 'advisor-annual';
UPDATE service_items SET title = 'CPSC召回', sort_order = 20, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-disputes') WHERE slug = 'advisor-labor';
UPDATE service_items SET title = '恶意索赔处理', sort_order = 30, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-disputes') WHERE slug = 'advisor-equity';
UPDATE service_items SET title = '亚马逊APEX专利中立评估', sort_order = 40, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-disputes') WHERE slug = 'advisor-private';

UPDATE service_items SET title = '劳动人事管理', sort_order = 10, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-cross-border') WHERE slug = 'dispute-logistics';
UPDATE service_items SET title = '跨境物流纠纷', sort_order = 20, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-cross-border') WHERE slug = 'dispute-ecommerce';
UPDATE service_items SET title = '货代民商纠纷', sort_order = 30, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-cross-border') WHERE slug = 'dispute-contract';
UPDATE service_items SET title = '企业法律顾问', sort_order = 40, status = 1, section_id = (SELECT id FROM service_sections WHERE slug = 'team-cross-border') WHERE slug = 'dispute-document';

-- 4) 核心优势与页脚配置，所有键均按当前版本幂等补齐。
INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'home_core_advantages', 'home', 110,
  '[{"title":"专业团队","description":"TRO业务是法律业务，请认准律师事务所资质，我们汇聚了近30名中美知名的资深专业律师，联合为您护航。","highlights":["30"]},{"title":"经验丰富","description":"深耕美国TRO诉讼领域8年，处理过上万起TRO侵权案，精准把握案件复杂性，为您提供高效、最低和解金的处理方案。","highlights":["8年","上万起TRO"]},{"title":"低支高效","description":"在同等TRO案情下，我们能够成功将和解金额降至最低，且多个应诉案件实现0赔偿。","highlights":[]},{"title":"无果免酬","description":"零费用启动，和解成功，按约定收费，和解不成功，您无需支付任何费用。","highlights":[]}]',
  'json', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'home_core_advantages' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'footer_intro', 'general', 90,
  '大信法务团队为深耕跨境赛道的专业跨境电商、国际物流律师团队。主营海运、空运全链路法律业务，面向国际物流、跨境服务商、出海卖家提供法律顾问服务；同步覆盖用工劳动合规、TRO、合同风控、海关合规，可代理各类纠纷诉讼，高效处理货损、欠款、维权等各类争议。',
  'text', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'footer_intro' AND is_current = 1);

INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'footer_qr_primary', 'general', 100, '', 'image', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'footer_qr_primary' AND is_current = 1);
INSERT INTO site_settings
  (setting_key, setting_group, sort_order, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
SELECT 'footer_qr_secondary', 'general', 110, '', 'image', NULL, 1, 1, 'published', NOW(), NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE setting_key = 'footer_qr_secondary' AND is_current = 1);
