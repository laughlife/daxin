// 站点配置种子：把写死在前端 config 里的站点文案、业务板块、页脚与联系渠道写入数据库。
//
// 目的：Task 7/8 要让后台可编辑这些内容，因此必须先有一份与当前前端一致的初始数据。
// 文案来源是《大信团队官网需求文档》原文（迁移前保存在 web/app/config/*.ts），
// 本脚本只做搬运，不改写业务含义。
//
// 幂等：site_settings 按 setting_key 就地更新（version 加一），
// service_sections / service_items 按 slug、footer_*/contact_channels/qr_assets 按 item_key upsert。
//
// 用法：
//   node tools/seed-site-config.mjs --dry-run   只打印将写入的内容
//   node tools/seed-site-config.mjs --apply     写库
import { executeSql, executeSqlBatch, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

function parseArgs(argv) {
  const options = { apply: false, dryRun: false }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** site_settings：setting_key → { group, value, valueType } */
const SITE_SETTINGS = [
  // general：站点基础信息
  { key: 'site_name', group: 'general', value: '大信法务', valueType: 'text' },
  { key: 'site_subtitle', group: 'general', value: '跨境电商与国际物流法律服务', valueType: 'text' },
  { key: 'site_description', group: 'general', value: '大信法务团队，为跨境电商与国际物流企业提供 TRO、知识产权、劳动合规与争议解决服务。', valueType: 'text' },
  { key: 'contact_phone', group: 'general', value: '15918796817', valueType: 'text' },
  { key: 'contact_email', group: 'general', value: 'xiaohua131400@126.com', valueType: 'text' },
  { key: 'contact_address', group: 'general', value: '深圳市龙岗区坂雪岗科技城吉华路与杨山路交会处乐荟中心 TOWER12', valueType: 'text' },
  { key: 'contact_notice', group: 'general', value: '联系方式来自需求文档初稿，待甲方最终确认。', valueType: 'text' },
  // 图片类配置留空，由后台上传后写入 media_id（不预置假图片）
  { key: 'site_logo', group: 'general', value: '', valueType: 'image' },
  { key: 'home_right_image', group: 'home', value: '', valueType: 'image' },
  { key: 'about_team_image', group: 'about', value: '', valueType: 'image' },

  // home：首页文案
  { key: 'home_hero_badge', group: 'home', value: '跨境电商 · 全链路法律服务', valueType: 'text' },
  { key: 'home_hero_title', group: 'home', value: '跨境有我，法律无忧', valueType: 'text' },
  { key: 'home_hero_subtitle', group: 'home', value: '专注于为跨境电商企业、品牌卖家及供应链伙伴提供全链路、跨法域、高实效的法律顾问服务', valueType: 'text' },
  { key: 'home_hero_primary_label', group: 'home', value: '查询 TRO 案件', valueType: 'text' },
  { key: 'home_hero_primary_link', group: 'home', value: '/tro/cases', valueType: 'text' },
  { key: 'home_hero_secondary_label', group: 'home', value: '联系我们免费评估案件', valueType: 'text' },
  {
    key: 'home_stats',
    group: 'home',
    valueType: 'json',
    value: JSON.stringify([
      { value: '7 年', label: '行业深耕', description: '专注从事跨境电商法律咨询服务', emphasis: true },
      { value: '1000+', label: '企业客户', description: '服务近千家跨境电商企业', emphasis: false },
      { value: '10000+', label: '案件处理', description: '处理近万起法律案件', emphasis: false },
      { value: '95%', label: '客户推荐率', description: '服务质量驱动的口碑推荐', emphasis: true },
      { value: '24 小时', label: '全天响应', description: '7×24 小时全天响应', emphasis: false },
    ]),
  },
  { key: 'home_consultation_title', group: 'home', value: '24H/7 联系法务团队', valueType: 'text' },
  { key: 'home_consultation_description', group: 'home', value: '无论 TRO 案件、物流纠纷还是劳动用工问题，均可通过电话、邮箱或微信咨询号联系我们，获取免费初步评估。', valueType: 'text' },
  { key: 'home_consultation_button', group: 'home', value: '微信二维码咨询', valueType: 'text' },

  // about：关于我们
  { key: 'about_team_title', group: 'about', value: 'About US · 大信法务团队', valueType: 'text' },
  {
    key: 'about_team_paragraphs',
    group: 'about',
    valueType: 'json',
    value: JSON.stringify([
      '大信法务团队成立于 2019 年，深耕法律行业多年，拥有经验丰富的国内外实力律师。',
      '主营海运、空运全链路法律业务，面向国际物流、跨境服务商、出海卖家提供法律顾问服务；同步覆盖 TRO 知识产权、CPSC 召回、美国加州 65 号法案、用工劳动合规、合同风控、海关合规，可代理各类纠纷诉讼，高效处理货损、欠款、维权等各类争议。',
    ]),
  },
  { key: 'about_more_label', group: 'about', value: '了解更多关于我们', valueType: 'text' },
  { key: 'about_more_link', group: 'about', value: '/about', valueType: 'text' },

  // seo
  { key: 'seo_home_title', group: 'seo', value: '大信法务 · 跨境电商与国际物流法律服务', valueType: 'text' },
  { key: 'seo_home_description', group: 'seo', value: '大信法务团队，为跨境电商与国际物流企业提供 TRO、知识产权、劳动合规与争议解决服务。', valueType: 'text' },
]

/** service_sections + service_items：首页「核心业务」四块 */
const SERVICE_SECTIONS = [
  {
    slug: 'overseas-tro',
    // 需求文档与 spec 明确：首页第一块为「TRO 全流程处理」，且只有它跳转成功案例。
    title: 'TRO 全流程处理',
    summary: '面向美国 TRO 临时限制令的和解、应诉、起诉全流程，以及平台链接维权下架。',
    iconKey: 'scale',
    linkPath: '/tro/success-cases',
    showDetailLink: true,
    sortOrder: 10,
    items: [
      { slug: 'overseas-tro-settle', title: 'TRO 和解', sortOrder: 10 },
      { slug: 'overseas-tro-defend', title: 'TRO 应诉', sortOrder: 20 },
      { slug: 'overseas-tro-sue', title: 'TRO 起诉', sortOrder: 30 },
      { slug: 'overseas-tro-link', title: '链接维权下架', sortOrder: 40 },
    ],
  },
  {
    slug: 'overseas-compliance',
    title: '平台合规与知识产权布局',
    summary: '亚马逊全套申诉、CPSC 产品召回、美国加州 65 号法案应对与知识产权布局。',
    iconKey: 'shield',
    linkPath: '/about',
    showDetailLink: false,
    sortOrder: 20,
    items: [
      { slug: 'compliance-amazon', title: '亚马逊全套申诉', sortOrder: 10 },
      { slug: 'compliance-ca65', title: '美国加州 65 法案', sortOrder: 20 },
      { slug: 'compliance-cpsc', title: 'CPSC 产品召回', sortOrder: 30 },
      { slug: 'compliance-ip', title: '知识产权布局', sortOrder: 40 },
    ],
  },
  {
    slug: 'domestic-advisor',
    title: '企业法律顾问',
    summary: '为企业与经营者提供常年法律顾问、劳动人事、股权投融资与私人律师服务。',
    iconKey: 'briefcase',
    linkPath: '/about',
    showDetailLink: false,
    sortOrder: 30,
    items: [
      { slug: 'advisor-annual', title: '常年法律顾问', sortOrder: 10 },
      { slug: 'advisor-labor', title: '劳动人事管理', sortOrder: 20 },
      { slug: 'advisor-equity', title: '股权及投融资', sortOrder: 30 },
      { slug: 'advisor-private', title: '老板私人律师', sortOrder: 40 },
    ],
  },
  {
    slug: 'domestic-disputes',
    title: '纠纷处理与法律文书',
    summary: '跨境物流、跨境电商与合同债务纠纷处理，以及各类法律文书撰写。',
    iconKey: 'document',
    linkPath: '/about',
    showDetailLink: false,
    sortOrder: 40,
    items: [
      { slug: 'dispute-logistics', title: '跨境物流纠纷', sortOrder: 10 },
      { slug: 'dispute-ecommerce', title: '跨境电商纠纷', sortOrder: 20 },
      { slug: 'dispute-contract', title: '合同债务纠纷', sortOrder: 30 },
      { slug: 'dispute-document', title: '法律文书撰写', sortOrder: 40 },
    ],
  },
]

/** footer_services：页脚业务范围（全部来自 site.ts 的 footerNav.items） */
const FOOTER_SERVICES = [
  'TRO应诉和解', '亚马逊申诉/投诉', '不侵权报告', '商标/版权/专利申请注册', 'CPSC召回',
  '劳动争议', '货代民商纠纷', '企业法律顾问', '跨境纠纷',
].map((title, index) => ({ itemKey: `footer-service-${index + 1}`, title, sortOrder: (index + 1) * 10 }))

/** footer_links：页脚导航（取自 siteConfig.mainNav 的扁平化结果） */
const FOOTER_LINKS = [
  { itemKey: 'footer-link-cases', title: 'TRO 案件查询', linkPath: '/tro/cases' },
  { itemKey: 'footer-link-alerts', title: 'TRO 侵权预警', linkPath: '/tro/alerts' },
  { itemKey: 'footer-link-success', title: 'TRO 成功案例', linkPath: '/tro/success-cases' },
  { itemKey: 'footer-link-brand', title: '侵权品牌库', linkPath: '/brands' },
  { itemKey: 'footer-link-about', title: '关于我们', linkPath: '/about' },
  { itemKey: 'footer-link-privacy', title: '隐私政策', linkPath: '/privacy' },
  { itemKey: 'footer-link-disclaimer', title: '免责声明', linkPath: '/disclaimer' },
].map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))

/** contact_channels：联系渠道 */
const CONTACT_CHANNELS = [
  { itemKey: 'contact-phone', channelType: 'phone', label: '联系电话', value: '15918796817', sortOrder: 10 },
  { itemKey: 'contact-email', channelType: 'email', label: '邮箱', value: 'xiaohua131400@126.com', sortOrder: 20 },
  { itemKey: 'contact-address', channelType: 'address', label: '地址', value: '深圳市龙岗区坂雪岗科技城吉华路与杨山路交会处乐荟中心 TOWER12', sortOrder: 30 },
  { itemKey: 'contact-wechat-tro', channelType: 'wechat', label: 'TRO 咨询号', value: 'kjzx88', sortOrder: 40 },
  { itemKey: 'contact-wechat-labor', channelType: 'wechat', label: '劳动法咨询号', value: 'chen_6506', sortOrder: 50 },
]

/** qr_assets：二维码（图片由后台上传后关联 media_id，这里不预置假图片） */
const QR_ASSETS = [
  { itemKey: 'qr-tro-consult', title: 'TRO 咨询号二维码', caption: 'TRO 案件、侵权预警与跨境知识产权咨询', sortOrder: 10 },
  { itemKey: 'qr-labor-consult', title: '劳动法咨询号二维码', caption: '劳动争议与企业用工咨询', sortOrder: 20 },
]

function upsertSettingStatement(item) {
  return `INSERT INTO site_settings (setting_key, setting_group, setting_value, value_type, version, status, is_current)
VALUES (${quoteLiteral(item.key)}, ${quoteLiteral(item.group)}, ${quoteLiteral(item.value)}, ${quoteLiteral(item.valueType)}, 1, 'published', 1)
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  value_type = VALUES(value_type),
  setting_group = VALUES(setting_group),
  version = version + 1,
  updated_at = NOW()`
}

function upsertSectionStatement(section) {
  return `INSERT INTO service_sections (slug, title, summary, icon_key, link_path, show_detail_link, sort_order, status)
VALUES (${quoteLiteral(section.slug)}, ${quoteLiteral(section.title)}, ${quoteLiteral(section.summary)},
        ${quoteLiteral(section.iconKey)}, ${quoteLiteral(section.linkPath)}, ${section.showDetailLink ? 1 : 0},
        ${section.sortOrder}, 1)
ON DUPLICATE KEY UPDATE
  title = VALUES(title), summary = VALUES(summary), icon_key = VALUES(icon_key),
  link_path = VALUES(link_path), show_detail_link = VALUES(show_detail_link),
  sort_order = VALUES(sort_order), updated_at = NOW()`
}

function upsertServiceItemStatement(sectionSlug, item) {
  return `INSERT INTO service_items (section_id, slug, title, summary, sort_order, status)
SELECT s.id, ${quoteLiteral(item.slug)}, ${quoteLiteral(item.title)}, '', ${item.sortOrder}, 1
FROM service_sections s WHERE s.slug = ${quoteLiteral(sectionSlug)}
ON DUPLICATE KEY UPDATE
  title = VALUES(title), sort_order = VALUES(sort_order), updated_at = NOW()`
}

function upsertFooterServiceStatement(item) {
  return `INSERT INTO footer_services (item_key, title, link_path, sort_order, status)
VALUES (${quoteLiteral(item.itemKey)}, ${quoteLiteral(item.title)}, '', ${item.sortOrder}, 1)
ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order), updated_at = NOW()`
}

function upsertFooterLinkStatement(item) {
  return `INSERT INTO footer_links (item_key, title, link_path, sort_order, status)
VALUES (${quoteLiteral(item.itemKey)}, ${quoteLiteral(item.title)}, ${quoteLiteral(item.linkPath)}, ${item.sortOrder}, 1)
ON DUPLICATE KEY UPDATE title = VALUES(title), link_path = VALUES(link_path), sort_order = VALUES(sort_order), updated_at = NOW()`
}

function upsertContactStatement(item) {
  return `INSERT INTO contact_channels (item_key, channel_type, label, value, sort_order, status)
VALUES (${quoteLiteral(item.itemKey)}, ${quoteLiteral(item.channelType)}, ${quoteLiteral(item.label)}, ${quoteLiteral(item.value)}, ${item.sortOrder}, 1)
ON DUPLICATE KEY UPDATE channel_type = VALUES(channel_type), label = VALUES(label), value = VALUES(value),
  sort_order = VALUES(sort_order), updated_at = NOW()`
}

function upsertQrStatement(item) {
  return `INSERT INTO qr_assets (item_key, title, caption, sort_order, status)
VALUES (${quoteLiteral(item.itemKey)}, ${quoteLiteral(item.title)}, ${quoteLiteral(item.caption)}, ${item.sortOrder}, 1)
ON DUPLICATE KEY UPDATE title = VALUES(title), caption = VALUES(caption), sort_order = VALUES(sort_order), updated_at = NOW()`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/seed-site-config.mjs <--dry-run|--apply>')
    return
  }
  if (options.apply === options.dryRun) {
    console.error('必须且只能指定 --dry-run 或 --apply 之一')
    process.exitCode = 2
    return
  }

  console.log('将写入：')
  console.log(`  site_settings: ${SITE_SETTINGS.length} 项`)
  console.log(`  service_sections: ${SERVICE_SECTIONS.length} 个板块，service_items: ${SERVICE_SECTIONS.reduce((sum, s) => sum + s.items.length, 0)} 个子项`)
  console.log(`  footer_services: ${FOOTER_SERVICES.length} 项，footer_links: ${FOOTER_LINKS.length} 项`)
  console.log(`  contact_channels: ${CONTACT_CHANNELS.length} 项，qr_assets: ${QR_ASSETS.length} 项`)

  if (options.dryRun) {
    console.log('\n== site_settings 明细 ==')
    for (const item of SITE_SETTINGS) {
      const preview = item.value.length > 60 ? `${item.value.slice(0, 60)}…` : item.value
      console.log(`  [${item.group}] ${item.key} = ${preview || '(空，由后台上传)'}`)
    }
    console.log('\n== 业务板块 ==')
    for (const section of SERVICE_SECTIONS) {
      console.log(`  ${section.slug} · ${section.title}（了解详情=${section.showDetailLink ? '显示' : '隐藏'}，跳转 ${section.linkPath}）`)
      console.log(`    子项：${section.items.map((item) => item.title).join('、')}`)
    }
    console.log('\n--dry-run 结束：未写库。')
    return
  }

  const target = resolveTargetConnection()
  if (!target) {
    console.error('无法解析目标库连接：请检查 web/.env 的 DB_*')
    process.exitCode = 2
    return
  }

  await executeSqlBatch(target, SITE_SETTINGS.map(upsertSettingStatement))
  await executeSqlBatch(target, SERVICE_SECTIONS.map(upsertSectionStatement))
  await executeSqlBatch(target, SERVICE_SECTIONS.flatMap((section) => section.items.map((item) => upsertServiceItemStatement(section.slug, item))))
  await executeSqlBatch(target, FOOTER_SERVICES.map(upsertFooterServiceStatement))
  await executeSqlBatch(target, FOOTER_LINKS.map(upsertFooterLinkStatement))
  await executeSqlBatch(target, CONTACT_CHANNELS.map(upsertContactStatement))
  await executeSqlBatch(target, QR_ASSETS.map(upsertQrStatement))

  const counts = {}
  for (const table of ['site_settings', 'service_sections', 'service_items', 'footer_services', 'footer_links', 'contact_channels', 'qr_assets']) {
    const rows = await queryRows(target, `SELECT COUNT(*) FROM \`${table}\``)
    counts[table] = rows[0]?.[0] ?? '?'
  }
  console.log('\n写入完成，当前行数：')
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`)
}

main().catch((error) => {
  console.error(`种子写入失败：${error.message}`)
  process.exitCode = 1
})
