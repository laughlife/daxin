import type { BusinessCard } from '../types/content'

/**
 * 核心业务四大板块（需求方 2026-10-10 提供的文案，原文见 docs/core-business-copy.md）。
 *
 * 结构与排版依需求方确认：
 * - **四个板块平铺为 2×2，不再分「国外业务 / 国内业务」两组**；
 * - 每个板块 = 标题 + 描述 + 要点列表；
 * - 第一块的成绩文案（「团队处理上万起 TRO 侵权案件…」）独立成块强调，故用 achievement 字段。
 *
 * 文案按原文录入并做最基本的标点规范（统一全角、补句末句号），不改写业务含义、不增删业务项。
 * 首页仅第一块「TRO全流程处理」提供「了解详情」入口并指向 TRO 成功案例，其余三块不提供。
 */
export const businessCards: BusinessCard[] = [
  {
    id: 'tro-full-process',
    group: 'overseas',
    title: 'TRO全流程处理',
    summary: '美国TRO起诉、应诉与和解，缺席判决及疑难案件，助力客户低成本快速解冻账户。',
    achievement: '团队处理上万起TRO侵权案件，多案达成0赔偿撤诉或极低和解金，如沙滩包0赔偿解冻百万美金、钻石画案件0赔偿解冻45万美金等。',
    items: [],
    iconKey: 'scale',
    href: '/tro/success-cases',
    detailLinkLabel: '了解详情',
    accent: true
  },
  {
    id: 'cross-border-ip',
    group: 'overseas',
    title: '跨境知识产权服务',
    summary: '一站式跨境知产维权与合规，处理亚马逊侵权处罚，搭建美国品牌保护体系。',
    items: [
      '亚马逊全套申诉：侵权申诉、出具不侵权报告、链接恢复、绩效整改',
      '链接维权：竞品侵权投诉、恶意投诉抗辩、违规链接处理',
      '美国商标、版权、专利注册，构筑品牌壁垒'
    ],
    iconKey: 'shield',
    href: '/about',
    accent: false
  },
  {
    id: 'cross-border-compliance',
    group: 'overseas',
    title: '跨境产品合规与涉外纠纷',
    summary: '覆盖产品合规、平台评估及涉外商事纠纷，规避出海经营风险。',
    items: [
      '亚马逊APEX专利中立评估，应对专利纠纷，减少店铺处罚',
      '加州65法案：投诉应对、罚款抗辩、合规整改',
      'CPSC产品召回：抗辩减罚、解除商品下架',
      '跨境纠纷：物流货损、货代争议、跨境电商、货款与涉外合同维权'
    ],
    iconKey: 'document',
    href: '/about',
    accent: false
  },
  {
    id: 'domestic-corporate-counsel',
    group: 'domestic',
    title: '国内业务企业综合法律顾问',
    summary: '为企业提供全法务支持，覆盖日常经营、制度搭建、股权投融资及私人法律事务。',
    items: [
      '常年法务：法律咨询、合规培训、合同审核、商务谈判、账款催收',
      '劳动人事：企业规章、劳动合同、薪酬、反腐、竞业保密制度搭建',
      '股权投融资：架构设计、尽职调查、股权激励、合伙平台搭建',
      '私人法务：婚姻、债务等个人法律事务处理',
      '法律文书：律师函、诉状、各类商事合同起草与审查'
    ],
    iconKey: 'briefcase',
    href: '/about',
    accent: true
  }
]

/**
 * 分组标题（首页「核心业务」区域说明文字）。
 *
 * 四个板块改为平铺展示后不再按组分栏，这里仅保留区域级说明，
 * 供 BusinessSection 的 SectionHeading 使用。
 */
export const businessSection = {
  title: '核心业务',
  description: '覆盖跨境知识产权、产品合规、涉外纠纷与国内企业法律顾问四大板块。'
} as const
